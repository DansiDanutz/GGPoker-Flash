import Foundation
import Vision
import CoreImage
import CoreVideo
import CoreGraphics

// Usage: person_mask <input-image> <output-mask.png>
let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("usage: person_mask <input> <output>\n", stderr)
    exit(1)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8

let handler = VNImageRequestHandler(url: input, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("vision error: \(error)\n", stderr)
    exit(2)
}
guard let observation = request.results?.first else {
    fputs("no segmentation result\n", stderr)
    exit(3)
}
let buffer = observation.pixelBuffer
let ci = CIImage(cvPixelBuffer: buffer)
let context = CIContext()
do {
    try context.writePNGRepresentation(of: ci, to: output, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
} catch {
    fputs("write error: \(error)\n", stderr)
    exit(4)
}
print("mask written \(CVPixelBufferGetWidth(buffer))x\(CVPixelBufferGetHeight(buffer))")
