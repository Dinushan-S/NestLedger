Pod::Spec.new do |s|
  s.name           = 'ExpenseWidget'
  s.version        = '1.0.0'
  s.summary        = 'NestLedger expense shortcut widget bridge'
  s.description    = 'Shared widget configuration for NestLedger.'
  s.license        = 'MIT'
  s.author         = 'NestLedger'
  s.homepage       = 'https://nestledger.dinushan.dev'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/expo/expo.git', :tag => s.version.to_s }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
end
