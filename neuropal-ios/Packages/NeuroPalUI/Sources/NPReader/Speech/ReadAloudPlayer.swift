import AVFoundation
import MediaPlayer
import NPTheme
import Observation
import UIKit

/// The app's one read-aloud voice. A single instance, so the lock screen,
/// the remote controls and the audio session always agree about what's
/// playing; the reader that owns the content hooks in with `onWord`.
///
/// Speech runs unit by unit (a paragraph, long ones split at a sentence),
/// three utterances queued ahead. The spoken word comes from
/// `willSpeakRangeOfSpeechString`, mapped back through each utterance's
/// offset table. Pausing stops the synthesizer; playing restarts at the
/// current word (reliable across voice and speed changes, and after an
/// interruption).
@MainActor
@Observable
final class ReadAloudPlayer {
    static let shared = ReadAloudPlayer()

    /// The content loaded (nil = nothing to read).
    private(set) var scriptID: String?
    /// The document the voice belongs to.
    private(set) var documentID: String?
    private(set) var isPlaying = false
    /// The word being spoken, or where the voice starts next.
    private(set) var word = 0

    /// The screen that owns the voice: every spoken word, the end, and the
    /// remote "next/previous" buttons.
    @ObservationIgnored var onWord: (@MainActor (Int) -> Void)?
    @ObservationIgnored var onFinish: (@MainActor () -> Void)?
    @ObservationIgnored var onStep: (@MainActor (_ forward: Bool) -> Void)?

    @ObservationIgnored private(set) var script: SpeechScript?
    @ObservationIgnored private var settings = VoiceSettings()
    @ObservationIgnored private var voice: AVSpeechSynthesisVoice?
    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    @ObservationIgnored private let delegate = SpeechDelegate()
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var queued: [ObjectIdentifier: Queued] = [:]
    @ObservationIgnored private var nextUnit = 0
    @ObservationIgnored private var restartWork: DispatchWorkItem?
    @ObservationIgnored private var commandsReady = false
    @ObservationIgnored private var resumeAfterInterruption = false
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var commandTargets: [Any] = []

    private struct Queued {
        let generation: Int
        let unit: Int
        let utterance: AVSpeechUtterance
        /// UTF-16 offset of each spoken word in the utterance string.
        let offsets: [Int]
        /// The global word index of each spoken word.
        let words: [Int]
    }

    private init() {
        synth.usesApplicationAudioSession = true
        synth.delegate = delegate
        delegate.player = self
        voice = Self.resolveVoice(nil)
        observeSession()
    }

    // MARK: Content

    /// Load content (stopping whatever else was reading). Same content: no change.
    func load(_ script: SpeechScript, documentID: String, at word: Int) {
        if scriptID == script.id, self.documentID == documentID {
            self.script = script
            return
        }
        halt()
        self.script = script
        scriptID = script.id
        self.documentID = documentID
        self.word = clamp(word)
        updateNowPlaying()
    }

    func isReading(_ documentID: String) -> Bool { self.documentID == documentID }

    /// Stop and forget the content (its document was closed).
    func stop() {
        halt()
        script = nil
        scriptID = nil
        documentID = nil
        onWord = nil
        onFinish = nil
        onStep = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        setCommandsEnabled(false)
        deactivateSoon()
    }

    func stopIfReading(_ documentID: String) {
        if self.documentID == documentID { stop() }
    }

    // MARK: Transport

    func play(from start: Int? = nil) {
        guard let script, script.count > 0 else { return }
        prepareCommands()
        activateSession()
        generation += 1
        let gen = generation
        queued.removeAll()
        restartWork?.cancel()
        if synth.isSpeaking || synth.isPaused { synth.stopSpeaking(at: .immediate) }
        word = clamp(start ?? word)
        isPlaying = true
        nextUnit = script.unit(containing: word)
        updateNowPlaying()
        // Speak on the next turn of the run loop: a stop and a speak in the
        // same turn can drop the new utterance.
        DispatchQueue.main.async { [weak self] in
            onMain {
                guard let self, self.generation == gen, self.isPlaying else { return }
                self.fill(startingAt: self.word)
            }
        }
    }

    func pause() {
        guard isPlaying else { return }
        halt()
        updateNowPlaying()
        deactivateSoon()
    }

    func toggle() {
        if isPlaying { pause() } else { play() }
    }

    /// Move the voice (keeps reading if it was).
    func seek(to word: Int) {
        guard script != nil else { return }
        let target = clamp(word)
        if isPlaying {
            play(from: target)
        } else {
            self.word = target
            updateNowPlaying()
        }
    }

    /// Speed, pitch and voice. A change while reading restarts at the current word.
    func apply(_ next: VoiceSettings) {
        guard next != settings else { return }
        let voiceChanged = next.voiceIdentifier != settings.voiceIdentifier
        settings = next
        if voiceChanged || voice == nil { voice = Self.resolveVoice(next.voiceIdentifier) }
        guard isPlaying else {
            updateNowPlaying()
            return
        }
        restartWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            onMain {
                guard let self, self.isPlaying else { return }
                self.play(from: self.word)
            }
        }
        restartWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    // MARK: Queue

    private func halt() {
        generation += 1
        queued.removeAll()
        restartWork?.cancel()
        if synth.isSpeaking || synth.isPaused { synth.stopSpeaking(at: .immediate) }
        isPlaying = false
    }

    private func fill(startingAt start: Int?) {
        guard let script else { return }
        var from = start
        while queued.count < 3, nextUnit < script.units.count {
            let unit = nextUnit
            nextUnit += 1
            let range = script.units[unit]
            let first = from.map { max(range.lowerBound, min($0, range.upperBound - 1)) } ?? range.lowerBound
            from = nil
            enqueue(unit: unit, first: first, script: script)
        }
        if queued.isEmpty, nextUnit >= script.units.count { finished() }
    }

    private func enqueue(unit: Int, first: Int, script: SpeechScript) {
        let range = script.units[unit]
        guard first < range.upperBound else { return }
        var text = ""
        var utf16 = 0
        var offsets: [Int] = []
        var words: [Int] = []
        for w in first..<range.upperBound {
            let say = script.speech[w]
            if say.isEmpty { continue }
            if !text.isEmpty {
                text += " "
                utf16 += 1
            }
            offsets.append(utf16)
            words.append(w)
            text += say
            utf16 += say.utf16.count
        }
        guard !words.isEmpty else { return } // a silent unit (figures only)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AppPreferences.speechRate(forWordsPerMinute: settings.wordsPerMinute)
        utterance.pitchMultiplier = Float(min(2, max(0.5, settings.pitch)))
        utterance.volume = settings.muted ? 0 : 1
        utterance.voice = voice
        utterance.postUtteranceDelay = unit < script.pauses.count ? script.pauses[unit] : 0.1
        utterance.prefersAssistiveTechnologySettings = false
        queued[ObjectIdentifier(utterance)] = Queued(generation: generation, unit: unit, utterance: utterance,
                                                     offsets: offsets, words: words)
        synth.speak(utterance)
    }

    private func finished() {
        isPlaying = false
        word = max(0, (script?.count ?? 1) - 1)
        updateNowPlaying()
        deactivateSoon()
        onFinish?()
    }

    private func clamp(_ w: Int) -> Int { min(max(0, w), max(0, (script?.count ?? 1) - 1)) }

    private func setWord(_ w: Int) {
        guard w != word else { return }
        word = w
        onWord?(w)
    }

    // MARK: Synthesizer callbacks (hopped to the main actor by SpeechDelegate)

    fileprivate func didStart(_ id: ObjectIdentifier) {
        guard let q = queued[id], q.generation == generation, let first = q.words.first else { return }
        setWord(first)
        updateNowPlaying()
    }

    fileprivate func willSpeak(_ id: ObjectIdentifier, at location: Int) {
        guard let q = queued[id], q.generation == generation, !q.offsets.isEmpty else { return }
        var lo = 0
        var hi = q.offsets.count - 1
        var hit = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if q.offsets[mid] <= location {
                hit = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        setWord(q.words[hit])
    }

    fileprivate func didFinish(_ id: ObjectIdentifier) {
        guard let q = queued.removeValue(forKey: id), q.generation == generation else { return }
        fill(startingAt: nil)
    }

    fileprivate func didCancel(_ id: ObjectIdentifier) {
        queued.removeValue(forKey: id)
    }

    // MARK: Voice

    /// The chosen voice, or the system default for the current language.
    static func resolveVoice(_ identifier: String?) -> AVSpeechSynthesisVoice? {
        if let identifier, let v = AVSpeechSynthesisVoice(identifier: identifier) { return v }
        return AVSpeechSynthesisVoice(language: AVSpeechSynthesisVoice.currentLanguageCode())
    }

    // MARK: Audio session

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [])
        try? session.setActive(true)
    }

    private func deactivateSoon() {
        let gen = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            onMain {
                guard let self, !self.isPlaying, self.generation == gen else { return }
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
        }
    }

    private func observeSession() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil,
                                            queue: .main) { [weak self] note in
            let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
                .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
            let options = AVAudioSession.InterruptionOptions(
                rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            onMain { self?.interrupted(type, options) }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil,
                                            queue: .main) { [weak self] note in
            let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
                .flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
            // Headphones out: stop talking out loud in the room.
            onMain { if reason == .oldDeviceUnavailable { self?.pause() } }
        })
    }

    private func interrupted(_ type: AVAudioSession.InterruptionType?, _ options: AVAudioSession.InterruptionOptions) {
        if type == .began {
            resumeAfterInterruption = isPlaying
            pause()
        } else if type == .ended {
            if resumeAfterInterruption, options.contains(.shouldResume) { play() }
            resumeAfterInterruption = false
        }
    }

    // MARK: Lock screen and remote controls

    private func prepareCommands() {
        defer { setCommandsEnabled(true) }
        guard !commandsReady else { return }
        commandsReady = true
        let c = MPRemoteCommandCenter.shared()
        commandTargets.append(c.playCommand.addTarget { [weak self] _ in
            onMain { self?.play() }
            return .success
        })
        commandTargets.append(c.pauseCommand.addTarget { [weak self] _ in
            onMain { self?.pause() }
            return .success
        })
        commandTargets.append(c.togglePlayPauseCommand.addTarget { [weak self] _ in
            onMain { self?.toggle() }
            return .success
        })
        commandTargets.append(c.nextTrackCommand.addTarget { [weak self] _ in
            onMain { self?.onStep?(true) }
            return .success
        })
        commandTargets.append(c.previousTrackCommand.addTarget { [weak self] _ in
            onMain { self?.onStep?(false) }
            return .success
        })
        commandTargets.append(c.changePlaybackPositionCommand.addTarget { [weak self] event in
            let seconds = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime ?? 0
            onMain {
                guard let self else { return }
                let w = Int(seconds * max(60, self.settings.wordsPerMinute) / 60)
                self.seek(to: w)
                self.onWord?(self.word)
            }
            return .success
        })
    }

    private func setCommandsEnabled(_ on: Bool) {
        let c = MPRemoteCommandCenter.shared()
        for command in [c.playCommand, c.pauseCommand, c.togglePlayPauseCommand, c.nextTrackCommand,
                        c.previousTrackCommand, c.changePlaybackPositionCommand] {
            command.isEnabled = on
        }
    }

    private func updateNowPlaying() {
        guard let script else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        let wpm = max(60, settings.wordsPerMinute)
        let info: [String: Any] = [
            MPMediaItemPropertyTitle: script.title,
            MPMediaItemPropertyArtist: script.subtitle ?? "NeuroPal",
            MPMediaItemPropertyAlbumTitle: "NeuroPal",
            MPMediaItemPropertyPlaybackDuration: Double(script.count) * 60 / wpm,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: Double(word) * 60 / wpm,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}

/// AVSpeechSynthesizer's delegate: hops every callback onto the main actor,
/// in order (the main queue is serial).
private final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    weak var player: ReadAloudPlayer?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        DispatchQueue.main.async { [weak player = self.player] in onMain { player?.didStart(id) } }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange,
                           utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        let location = characterRange.location
        DispatchQueue.main.async { [weak player = self.player] in onMain { player?.willSpeak(id, at: location) } }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        DispatchQueue.main.async { [weak player = self.player] in onMain { player?.didFinish(id) } }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        DispatchQueue.main.async { [weak player = self.player] in onMain { player?.didCancel(id) } }
    }
}

/// Runs `body` on the main actor from a callback that UIKit, AVFoundation or
/// MediaPlayer delivers on the main thread (traps if that's ever not true).
func onMain(_ body: @MainActor () -> Void) {
    MainActor.assumeIsolated(body)
}
