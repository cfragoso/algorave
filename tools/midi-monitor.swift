// Read-only CoreMIDI monitor. No messages are sent to the controller.
import Foundation
import CoreMIDI

func name(_ object: MIDIObjectRef) -> String {
    var value: Unmanaged<CFString>?
    guard MIDIObjectGetStringProperty(object, kMIDIPropertyDisplayName, &value) == noErr,
          let value = value else { return "Unknown" }
    return value.takeRetainedValue() as String
}

var client = MIDIClientRef()
var port = MIDIPortRef()
let status = MIDIClientCreate("Strudel mapping monitor" as CFString, nil, nil, &client)
guard status == noErr else { fatalError("CoreMIDI client error: \(status)") }
let portStatus = MIDIInputPortCreateWithBlock(client, "Read-only input" as CFString, &port) { list, _ in
    let offset = MemoryLayout<MIDIPacketList>.offset(of: \.packet)!
    var packet = UnsafeRawPointer(list).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
    for _ in 0..<list.pointee.numPackets {
        let current = packet.pointee
        let bytes = withUnsafeBytes(of: current.data) { Array($0.prefix(Int(current.length))) }
        print("MIDI " + bytes.map { String(format: "%02X", $0) }.joined(separator: " "))
        fflush(stdout)
        packet = UnsafePointer(MIDIPacketNext(UnsafeMutablePointer(mutating: packet)))
    }
}
guard portStatus == noErr else { fatalError("CoreMIDI port error: \(portStatus)") }
var connected = 0
for index in 0..<MIDIGetNumberOfSources() {
    let source = MIDIGetSource(index)
    let label = name(source)
    print("INPUT: \(label)")
    if label.localizedCaseInsensitiveContains("Launch Control") {
        let result = MIDIPortConnectSource(port, source, nil)
        guard result == noErr else { fatalError("Connection error: \(result)") }
        print("LISTENING: \(label)")
        connected += 1
    }
}
fflush(stdout)
guard connected > 0 else { fatalError("No Launch Control MIDI input found") }
RunLoop.current.run(until: Date(timeIntervalSinceNow: 600))
MIDIPortDispose(port)
MIDIClientDispose(client)
