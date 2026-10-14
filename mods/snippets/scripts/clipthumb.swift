// Saves the image on the clipboard as a small PNG thumbnail. Usage: clipthumb <out.png> <max-px>.
// Prints "<width> <height>" of the thumbnail; exits 1 when the clipboard holds no image.
import AppKit

let args = CommandLine.arguments
guard args.count >= 3, let maxSide = Double(args[2]) else { exit(2) }
guard let image = NSImage(pasteboard: NSPasteboard.general),
      let source = image.representations.first else { exit(1) }
let width = Double(source.pixelsWide > 0 ? source.pixelsWide : Int(image.size.width))
let height = Double(source.pixelsHigh > 0 ? source.pixelsHigh : Int(image.size.height))
guard width > 0, height > 0 else { exit(1) }
let scale = min(1, maxSide / max(width, height))
let outWidth = max(1, Int((width * scale).rounded()))
let outHeight = max(1, Int((height * scale).rounded()))
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: outWidth, pixelsHigh: outHeight,
                                    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { exit(1) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSGraphicsContext.current?.imageInterpolation = .high
image.draw(in: NSRect(x: 0, y: 0, width: outWidth, height: outHeight))
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
let url = URL(fileURLWithPath: args[1])
try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
do { try png.write(to: url) } catch { exit(1) }
print(outWidth, outHeight)
