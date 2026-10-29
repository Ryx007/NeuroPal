import Foundation
import Testing
@testable import NPDay

@Test func sliderRegions() {
    #expect(NervousState.forLevel(0) == .green)
    #expect(NervousState.forLevel(0.5) == .yellow)
    #expect(NervousState.forLevel(1) == .red)
    for s in NervousState.allCases { #expect(NervousState.forLevel(s.middleLevel) == s) }
}

@MainActor
@Test func checkInUpdatesState() {
    let store = DayStore(day: .starter, persist: false)
    store.checkIn(.yellow, level: 0.55)
    #expect(store.day.state == .yellow)
    #expect(store.day.checkins.last?.level == 0.55)
}
