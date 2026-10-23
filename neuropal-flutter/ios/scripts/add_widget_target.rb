#!/usr/bin/env ruby
# Adds the NeuroPalWidget WidgetKit extension to Runner.xcodeproj (idempotent).
#
#   gem install xcodeproj        # once (CocoaPods already ships it)
#   ruby ios/scripts/add_widget_target.rb
#
# Run it again after `flutter create .` regenerates the iOS project. The
# committed Runner.xcodeproj already contains the target; the script exists
# so the wiring is reviewable and reproducible rather than hand-clicked.
require 'xcodeproj'

IOS = File.expand_path('..', __dir__)
project = Xcodeproj::Project.open(File.join(IOS, 'Runner.xcodeproj'))
app = project.targets.find { |t| t.name == 'Runner' } or abort('Runner target not found')

WIDGET = 'NeuroPalWidget'
APP_GROUP = 'group.io.neuropal.flutter'
SOURCES = %w[
  NeuroPalWidgetBundle.swift
  SharedStore.swift
  StateWidget.swift
  ReadingWidget.swift
  FocusLiveActivity.swift
  NeuroPalTokens.swift
].freeze
SHARED = 'FocusActivityAttributes.swift' # compiled into the app AND the widget

if project.targets.any? { |t| t.name == WIDGET }
  puts "#{WIDGET} target already present — nothing to do."
  exit 0
end

# --- the extension target ---------------------------------------------------
ext = project.new_target(:app_extension, WIDGET, :ios, '17.0', nil, :swift)

group = project.main_group.find_subpath(WIDGET, true)
group.set_source_tree('<group>')
group.set_path(WIDGET)

ext.add_file_references(SOURCES.map { |f| group.new_reference(f) })
shared_ref = group.new_reference(SHARED)
ext.add_file_references([shared_ref])
app.add_file_references([shared_ref])
%w[Info.plist NeuroPalWidget.entitlements Widget.xcconfig].each { |f| group.new_reference(f) }
xcconfig = group.files.find { |f| f.path == 'Widget.xcconfig' }

ext.build_configurations.each do |config|
  config.base_configuration_reference = xcconfig
  s = config.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'io.neuropal.flutter.widget'
  s['INFOPLIST_FILE'] = "#{WIDGET}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = "#{WIDGET}/NeuroPalWidget.entitlements"
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  s.delete('ASSETCATALOG_COMPILER_APPICON_NAME')
end

# --- embed it in the app ----------------------------------------------------
app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
build_file = embed.add_file_reference(ext.product_reference, true)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

# Flutter's "Thin Binary" script reads the built app; an extension embedded
# AFTER it makes Xcode report a dependency cycle. Embed first.
phases = app.build_phases
phases.delete(embed)
thin = phases.index { |p| p.respond_to?(:name) && p.name == 'Thin Binary' }
run = phases.index { |p| p.respond_to?(:name) && p.name == 'Run Script' }
insert_at = [thin, run].compact.min || phases.length
phases.insert(insert_at, embed)

# --- the app side: App Group + Live Activities ------------------------------
runner_dir = File.join(IOS, 'Runner')
ent_path = File.join(runner_dir, 'Runner.entitlements')
unless File.exist?(ent_path)
  File.write(ent_path, <<~PLIST)
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
    	<key>com.apple.security.application-groups</key>
    	<array>
    		<string>#{APP_GROUP}</string>
    	</array>
    </dict>
    </plist>
  PLIST
end
runner_group = project.main_group.find_subpath('Runner', false)
runner_group.new_reference('Runner.entitlements') unless runner_group.files.any? { |f| f.path == 'Runner.entitlements' }
# The method channel the Dart side talks to (widgets + Live Activity).
unless runner_group.files.any? { |f| f.path == 'NeuroPalIOSExtras.swift' }
  app.add_file_references([runner_group.new_reference('NeuroPalIOSExtras.swift')])
end
app.build_configurations.each do |config|
  s = config.build_settings
  s['CODE_SIGN_ENTITLEMENTS'] = 'Runner/Runner.entitlements'
  # The app still runs on iOS versions without WidgetKit/ActivityKit; every
  # use is behind #available, so link them weakly.
  flags = Array(s['OTHER_LDFLAGS'] || '$(inherited)')
  %w[WidgetKit ActivityKit].each { |fw| flags += ['-weak_framework', fw] unless flags.each_cons(2).include?(['-weak_framework', fw]) }
  s['OTHER_LDFLAGS'] = flags
end

project.save
puts "Added #{WIDGET} (iOS 17+) and embedded it in Runner."
