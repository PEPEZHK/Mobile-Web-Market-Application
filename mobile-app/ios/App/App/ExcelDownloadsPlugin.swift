import Foundation
import Capacitor

@objc(ExcelDownloadsPlugin)
public class ExcelDownloadsPlugin: CAPPlugin {
    @objc func saveToDownloads(_ call: CAPPluginCall) {
        call.reject("saveToDownloads not implemented on iOS")
    }
}
