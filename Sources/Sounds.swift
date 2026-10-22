import AVFoundation

// MARK: - Sound effects
//
// Synthesised once at launch rather than shipped as recordings: a thwip or a
// splat is little more than filtered noise with a falling pitch.
//
// Played through an audio engine on its own queue, never from the main thread.
// NSSound was tried first: its first play blocked for ~116ms and every later
// one for 12–22ms, a dropped frame at each cue, right as the animation moves.

final class SoundFX {
    enum Effect: CaseIterable {
        case thwip, thwipHeavy, splat, whoosh, pop, reel, blast, unweb
        case clank, flutter, flock, zap
        case roar, slam, crash, rubble
        case thunder, rain, crackle
    }

    static let shared = SoundFX()
    var enabled = true

    private let queue = DispatchQueue(label: "local.deskcharm.sound", qos: .userInitiated)
    private let engine = AVAudioEngine()
    private var voices: [AVAudioPlayerNode] = []
    private var nextVoice = 0
    private var buffers: [Effect: AVAudioPCMBuffer] = [:]
    private var idle: DispatchWorkItem?

    private init() {
        queue.async { self.setUp() }
    }

    func play(_ effect: Effect) {
        guard enabled else { return }
        queue.async { self.start(effect) }
    }

    private func setUp() {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Synth.rate, channels: 1) else { return }
        for effect in Effect.allCases {
            let samples = Synth.render(effect)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
                  let channel = buffer.floatChannelData?[0]
            else { continue }
            buffer.frameLength = buffer.frameCapacity
            samples.withUnsafeBufferPointer { channel.update(from: $0.baseAddress!, count: samples.count) }
            buffers[effect] = buffer
        }
        // Enough voices that a yank's cues and a blast's can overlap, and a
        // storm's rain can run under its thunder.
        for _ in 0..<6 {
            let voice = AVAudioPlayerNode()
            engine.attach(voice)
            engine.connect(voice, to: engine.mainMixerNode, format: format)
            voices.append(voice)
        }
        engine.mainMixerNode.outputVolume = 0.6
        engine.prepare()
        // The first start is the slow one; pay it now, then let the hardware sleep.
        if (try? engine.start()) != nil { engine.pause() }
    }

    private func start(_ effect: Effect) {
        guard let buffer = buffers[effect], !voices.isEmpty else { return }
        if !engine.isRunning {
            guard (try? engine.start()) != nil else { return }
        }
        // Round-robin, cutting off the oldest sound if all voices are busy.
        let voice = voices[nextVoice]
        nextVoice = (nextVoice + 1) % voices.count
        voice.stop()
        voice.scheduleBuffer(buffer, at: nil)
        voice.play()
        sleep(after: Double(buffer.frameLength) / Synth.rate + 1.5)
    }

    /// A running engine keeps the audio hardware awake, so it pauses once
    /// nothing has played for a moment.
    private func sleep(after seconds: Double) {
        idle?.cancel()
        let pause = DispatchWorkItem { [weak self] in self?.engine.pause() }
        idle = pause
        queue.asyncAfter(deadline: .now() + seconds, execute: pause)
    }
}

// MARK: Synthesis

enum Synth {
    static let rate = 44100.0

    static func render(_ effect: SoundFX.Effect) -> [Float] {
        switch effect {
        case .thwip: return thwip(pitch: 1, seed: 11)
        case .thwipHeavy: return thwip(pitch: 0.72, seed: 12)
        case .splat: return splat(seed: 21)
        case .whoosh: return whoosh(seconds: 0.55, seed: 31)
        case .pop: return pop(seed: 41)
        case .reel: return sweep(seconds: 0.22, from: 900, to: 3000, q: 3, peak: 0.35, seed: 51)
        case .blast: return blast(seed: 61)
        case .unweb: return sweep(seconds: 0.6, from: 2200, to: 420, q: 2.5, peak: 0.3, seed: 71)
        case .clank: return clank(seed: 91)
        case .flutter: return flutter(seconds: 2.6, seed: 101)
        case .flock: return flutter(seconds: 1.8, seed: 111)
        case .zap: return zap(seed: 121)
        case .roar: return roar(seed: 131)
        case .slam: return slam(seed: 141)
        case .crash: return crash(seed: 151)
        case .rubble: return rubble(seconds: 1.3, seed: 161)
        case .thunder: return thunder(seed: 171)
        case .rain: return rain(seconds: 5.2, seed: 181)
        case .crackle: return crackle(seconds: 0.95, seed: 191)
        }
    }

    /// The Hulk's roar: a ragged growl of clipped harmonics, its pitch heaving,
    /// through a throat of shifting formants, over rasping breath.
    static func roar(seed: UInt32) -> [Float] {
        var noise = Noise(seed), low = SVF(), high = SVF(), breath = SVF()
        var phase = 0.0
        let d = 1.25
        return shape(seconds: d, peak: 0.8) { t in
            let u = t / d
            phase += 2 * .pi * (92 + 30 * sin(.pi * u) + 9 * sin(t * 37)) / rate
            var buzz = 0.0
            for n in 1...9 { buzz += sin(Double(n) * phase) / Double(n) }
            let rough = Float(tanh(2.6 * buzz)) * (0.8 + 0.2 * noise.next())
            let throat = low.run(rough, cutoff: 520 + 300 * sin(.pi * u), q: 2.2).band
                + 0.7 * high.run(rough, cutoff: 1300 + 500 * u, q: 3).band
            let rasp = breath.run(noise.next(), cutoff: 900, q: 0.8).band
            let level = Float(min(1, t / 0.06) * min(1, (d - t) / 0.35))
            return (1.6 * throat + 0.5 * rasp) * level
        }
    }

    /// A window slammed into the floor: a deep boom, a crunch, and debris.
    static func slam(seed: UInt32) -> [Float] {
        var noise = Noise(seed), crunch = SVF(), debris = SVF()
        var boom = 0.0
        return shape(seconds: 0.5, peak: 0.85) { t in
            boom += 2 * .pi * glide(75, 32, t, over: 0.12) / rate
            let x = noise.next()
            let hit = crunch.run(x, cutoff: glide(3000, 400, t, over: 0.08), q: 0.9).low * env(t, attack: 0.001, decay: 0.05)
            let bits = debris.run(abs(x) > 0.985 ? x * 5 : 0, cutoff: 2500, q: 2).band * env(t - 0.02, attack: 0.01, decay: 0.12)
            return 1.3 * Float(sin(boom)) * env(t, attack: 0.001, decay: 0.12) + 0.9 * hit + 0.4 * bits
        }
    }

    /// A fist into concrete: a deep boom, a heavy crunch, grit spraying, and
    /// chunks clattering after.
    static func crash(seed: UInt32) -> [Float] {
        var noise = Noise(seed), crunch = SVF(), grit = SVF(), clatter = SVF()
        var boom = 0.0
        return shape(seconds: 0.9, peak: 0.9) { t in
            boom += 2 * .pi * glide(62, 28, t, over: 0.18) / rate
            let x = noise.next()
            let hit = crunch.run(x, cutoff: glide(2400, 260, t, over: 0.12), q: 0.8).low * env(t, attack: 0.001, decay: 0.09)
            let sand = grit.run(x, cutoff: 3200, q: 0.6).band * env(t, attack: 0.004, decay: 0.25)
            let bits = clatter.run(abs(x) > 0.982 ? x * 5 : 0, cutoff: 1400, q: 2.5).band * env(t - 0.03, attack: 0.01, decay: 0.3)
            return 1.4 * Float(sin(boom)) * env(t, attack: 0.001, decay: 0.2) + hit + 0.35 * sand + 0.6 * bits
        }
    }

    /// Smashed concrete falling away: a low rumble under a clatter of chunks
    /// landing, thinning out as it goes.
    static func rubble(seconds d: Double, seed: UInt32) -> [Float] {
        var noise = Noise(seed), rumble = SVF(), knock = SVF()
        var next = 0.0, from = -1.0, pitch = 600.0, level: Float = 0
        return shape(seconds: d, peak: 0.6) { t in
            let x = noise.next()
            if t >= next {
                from = t
                pitch = 300 + 900 * Double(abs(noise.next()))
                level = 0.4 + 0.6 * abs(noise.next())
                next = t + (0.02 + 0.07 * Double(abs(noise.next()))) * (1 + 2 * t / d)
            }
            let clack = knock.run(x, cutoff: pitch, q: 4).band * env(t - from, attack: 0.001, decay: 0.03) * level
            let low = rumble.run(x, cutoff: 160, q: 0.7).low
            let fade = Float(min(1, (d - t) / (0.6 * d)))
            return (1.6 * clack + 0.7 * low) * fade
        }
    }

    /// A window gone into the Batman charm: a bright zip diving in pitch over
    /// a glassy chime and a soft thump.
    static func zap(seed: UInt32) -> [Float] {
        var noise = Noise(seed), zip = SVF()
        var thump = 0.0
        return shape(seconds: 0.5, peak: 0.6) { t in
            let z = zip.run(noise.next(), cutoff: glide(5200, 700, t, over: 0.18), q: 6).band * env(t, attack: 0.002, decay: 0.07)
            let chime = Float(sin(2 * .pi * 1860 * t) + 0.6 * sin(2 * .pi * 2790 * t) + 0.35 * sin(2 * .pi * 4170 * t))
                * env(t, attack: 0.001, decay: 0.16)
            thump += 2 * .pi * glide(120, 55, t, over: 0.08) / rate
            return 1.3 * z + 0.25 * chime + 0.7 * Float(sin(thump)) * env(t, attack: 0.001, decay: 0.06)
        }
    }

    /// The grapple biting: a hard tick, a few inharmonic metal partials
    /// ringing down fast, and a low knock.
    static func clank(seed: UInt32) -> [Float] {
        var noise = Noise(seed), tick = SVF()
        var knock = 0.0
        let partials: [(f: Double, decay: Double, level: Float)] =
            [(540, 0.11, 1), (1290, 0.07, 0.7), (2230, 0.045, 0.5), (3570, 0.03, 0.35)]
        return shape(seconds: 0.32, peak: 0.7) { t in
            var ring: Float = 0
            for p in partials { ring += p.level * Float(sin(2 * .pi * p.f * t)) * env(t, attack: 0.0005, decay: p.decay) }
            knock += 2 * .pi * glide(140, 60, t, over: 0.05) / rate
            return 0.5 * ring + 0.8 * Float(sin(knock)) * env(t, attack: 0.001, decay: 0.04)
                + 0.7 * tick.run(noise.next(), cutoff: 4000, q: 0.7).high * env(t, attack: 0.0003, decay: 0.003)
        }
    }

    /// A swarm going past: rustling wings — noise chopped by a dozen
    /// wingbeats drifting in and out of step — and the air they move,
    /// swelling and passing, with squeaks dotted through it.
    static func flutter(seconds d: Double, seed: UInt32) -> [Float] {
        var noise = Noise(seed), wings = SVF(), air = SVF()
        let beats = (0..<12).map { _ in (rate: 9 + 7 * Double(abs(noise.next())), phase: Double(noise.next()) * .pi) }
        var squeakAt = 0.08, squeakFrom = 0.0, squeakPitch = 6000.0, squeakPhase = 0.0
        return shape(seconds: d, peak: 0.6) { t in
            let x = noise.next()
            var flap: Float = 0
            for b in beats { flap += Float(abs(sin(2 * .pi * b.rate * t + b.phase))) }
            let rustle = wings.run(x, cutoff: 1500, q: 0.9).band * pow(flap / Float(beats.count), 2.5)
            let gust = air.run(x, cutoff: 500, q: 0.7).low
            if t >= squeakAt {
                squeakFrom = t
                squeakPitch = 5200 + 2600 * Double(abs(noise.next()))
                squeakAt = t + 0.06 + 0.14 * Double(abs(noise.next()))
            }
            let s = t - squeakFrom
            squeakPhase += 2 * .pi * glide(squeakPitch, squeakPitch * 0.6, s, over: 0.035) / rate
            let squeak = s < 0.04 ? Float(sin(squeakPhase)) * env(s, attack: 0.004, decay: 0.012) : 0
            let swell = Float(min(1, t / 0.3) * min(1, (d - t) / 1.0))
            return (1.2 * rustle + 0.5 * gust + 0.12 * squeak) * swell
        }
    }

    /// The shot: a breath of hiss, then resonant noise whose pitch drops —
    /// the drop is what turns a hiss into a zip — over a faint falling whistle.
    static func thwip(pitch p: Double, seed: UInt32) -> [Float] {
        var noise = Noise(seed), hiss = SVF(), zip = SVF()
        var phase = 0.0
        return shape(seconds: 0.22, peak: 0.8) { t in
            let x = noise.next()
            let th = hiss.run(x, cutoff: 3200 * p, q: 0.7).high * env(t, attack: 0.002, decay: 0.022)
            let w = zip.run(x, cutoff: glide(4800 * p, 1000 * p, t - 0.008, over: 0.13), q: 7).band
                * (t < 0.008 ? 0 : env(t - 0.008, attack: 0.01, decay: 0.05))
            phase += 2 * .pi * glide(2600 * p, 800 * p, t, over: 0.12) / rate
            let whistle = Float(sin(phase)) * env(t, attack: 0.004, decay: 0.035)
            return 0.45 * th + 1.6 * w + 0.12 * whistle
        }
    }

    /// The web sticking: a muffled burst closing down fast, a low thump, and
    /// sparse crackle for the wet, tacky part.
    static func splat(seed: UInt32) -> [Float] {
        var noise = Noise(seed), body = SVF(), wet = SVF()
        var phase = 0.0
        return shape(seconds: 0.28, peak: 0.75) { t in
            let x = noise.next()
            let mush = body.run(x, cutoff: glide(2600, 220, t, over: 0.09), q: 1.1).low * env(t, attack: 0.002, decay: 0.06)
            let crackle = wet.run(abs(x) > 0.992 ? x * 6 : 0, cutoff: 1800, q: 3).band * env(t, attack: 0.001, decay: 0.07)
            phase += 2 * .pi * glide(150, 50, t, over: 0.07) / rate
            let thump = Float(sin(phase)) * env(t, attack: 0.001, decay: 0.045)
            return mush + 0.6 * crackle + 0.9 * thump
        }
    }

    /// The pull: air rising in pitch and swelling as the window rushes in,
    /// cut off at the catch.
    static func whoosh(seconds d: Double, seed: UInt32) -> [Float] {
        var noise = Noise(seed), low = SVF(), high = SVF()
        return shape(seconds: d, peak: 0.55) { t in
            let x = noise.next()
            let fc = glide(320, 2600, t, over: d * 0.9)
            let air = low.run(x, cutoff: fc, q: 1.6).band + 0.5 * high.run(x, cutoff: fc * 1.7, q: 2.2).band
            let u = t / d
            return air * Float(u < 0.88 ? pow(u / 0.88, 1.6) : (1 - u) / 0.12)
        }
    }

    /// The catch: a short dropping blip over a soft thud, with a tick on top.
    static func pop(seed: UInt32) -> [Float] {
        var noise = Noise(seed), tick = SVF()
        var blip = 0.0, sub = 0.0
        return shape(seconds: 0.14, peak: 0.7) { t in
            blip += 2 * .pi * glide(680, 300, t, over: 0.05) / rate
            sub += 2 * .pi * glide(170, 80, t, over: 0.06) / rate
            return Float(sin(blip)) * env(t, attack: 0.001, decay: 0.028)
                + 0.8 * Float(sin(sub)) * env(t, attack: 0.001, decay: 0.05)
                + 0.6 * tick.run(noise.next(), cutoff: 5000, q: 0.7).high * env(t, attack: 0.0005, decay: 0.004)
        }
    }

    /// The screen being webbed: a bigger, longer splat with a deep thump and
    /// a bright sheet of hiss for the flash.
    static func blast(seed: UInt32) -> [Float] {
        var noise = Noise(seed), body = SVF(), wet = SVF(), sheet = SVF()
        var phase = 0.0
        return shape(seconds: 1.1, peak: 0.85) { t in
            let x = noise.next()
            let mush = body.run(x, cutoff: glide(5200, 300, t, over: 0.35), q: 0.9).low * env(t, attack: 0.003, decay: 0.22)
            let crackle = wet.run(abs(x) > 0.99 ? x * 6 : 0, cutoff: 2200, q: 2.5).band * env(t, attack: 0.005, decay: 0.25)
            let hiss = sheet.run(x, cutoff: 4000, q: 0.7).high * env(t, attack: 0.004, decay: 0.12)
            phase += 2 * .pi * glide(95, 38, t, over: 0.25) / rate
            let thump = Float(sin(phase)) * env(t, attack: 0.002, decay: 0.16)
            return mush + 0.6 * crackle + 0.25 * hiss + 1.1 * thump
        }
    }

    /// Thunder: a sharp crack of high noise, a deep boom, then a long rumble
    /// rolling on as the sound comes back off the clouds, in swells that
    /// each die a little lower than the last.
    static func thunder(seed: UInt32) -> [Float] {
        var noise = Noise(seed), crack = SVF(), roll = SVF(), deep = SVF()
        var boom = 0.0
        let d = 3.4
        var swells: [(at: Double, level: Float)] = []
        for k in 0..<7 {
            let jitter = 0.15 * Double(abs(noise.next()))
            swells.append((at: 0.08 + 0.4 * Double(k) + jitter, level: Float(0.9 - 0.11 * Double(k))))
        }
        return shape(seconds: d, peak: 0.9) { t in
            let x = noise.next()
            let snap = crack.run(x, cutoff: glide(6500, 900, t, over: 0.12), q: 0.8).high * env(t, attack: 0.0005, decay: 0.035)
            boom += 2 * .pi * glide(78, 34, t, over: 0.35) / rate
            var rumble: Float = 0
            for s in swells where t >= s.at { rumble += s.level * env(t - s.at, attack: 0.09, decay: 0.34) }
            let body = roll.run(x, cutoff: glide(520, 130, t, over: d), q: 0.7).low
            let sub = deep.run(x, cutoff: 70, q: 0.8).low
            let tail = Float(min(1, (d - t) / 0.8))
            return (0.7 * snap + 1.2 * Float(sin(boom)) * env(t, attack: 0.002, decay: 0.3)
                    + (2.4 * body + 4 * sub) * rumble) * tail
        }
    }

    /// Steady rain: a wide hiss of noise with a softer patter in the mids,
    /// swelling in as the sky closes and out as it clears.
    static func rain(seconds d: Double, seed: UInt32) -> [Float] {
        var noise = Noise(seed), hiss = SVF(), patter = SVF()
        return shape(seconds: d, peak: 0.4) { t in
            let x = noise.next()
            let spray = hiss.run(x, cutoff: 5200, q: 0.6).high
            let drops = patter.run(abs(x) > 0.93 ? x * 3 : 0, cutoff: 2400, q: 1.2).band
            let swell = Float(min(1, t / 0.7) * min(1, (d - t) / 1.2))
            return (0.8 * spray + 0.9 * drops) * swell
        }
    }

    /// Electricity arcing: sharp random snaps of high noise, thick and
    /// quick, over a thin buzz, swelling in as the charge builds.
    static func crackle(seconds d: Double, seed: UInt32) -> [Float] {
        var noise = Noise(seed), snap = SVF(), buzz = SVF()
        var next = 0.0, from = -1.0, level: Float = 0
        return shape(seconds: d, peak: 0.6) { t in
            let x = noise.next()
            if t >= next {
                from = t
                level = 0.4 + 0.6 * abs(noise.next())
                next = t + 0.008 + 0.045 * Double(abs(noise.next()))
            }
            let bright: Float = snap.run(x, cutoff: 4200, q: 0.7).high
            let spark: Float = bright * env(t - from, attack: 0.0004, decay: 0.006) * level
            let hum: Float = buzz.run(x, cutoff: 1700, q: 3).band * 0.12
            let rise: Double = min(1, 0.35 + t / 0.3)
            let fall: Double = min(1, (d - t) / 0.2)
            let swell = Float(rise * fall)
            let mix: Float = 2 * spark + hum
            return mix * swell
        }
    }

    /// A soft zip of resonant noise gliding between two pitches, used for the
    /// web reeling back in and for letting go of the screen.
    static func sweep(seconds d: Double, from a: Double, to b: Double, q: Double,
                      peak: Float, seed: UInt32) -> [Float] {
        var noise = Noise(seed), filter = SVF()
        return shape(seconds: d, peak: peak) { t in
            let s = Float(sin(.pi * t / d))
            return filter.run(noise.next(), cutoff: glide(a, b, t, over: d), q: q).band * s * s
        }
    }

    // MARK: Building blocks

    /// Samples `f` over time, then scales to `peak` and fades the last few
    /// milliseconds so nothing ends on a click.
    static func shape(seconds: Double, peak: Float, _ f: (Double) -> Float) -> [Float] {
        var s = (0..<Int(seconds * rate)).map { f(Double($0) / rate) }
        let top = s.map(abs).max() ?? 0
        guard top > 0 else { return s }
        let fade = min(s.count, Int(0.003 * rate))
        for i in s.indices {
            s[i] *= peak / top
            let left = s.count - 1 - i
            if left < fade { s[i] *= Float(left) / Float(fade) }
        }
        return s
    }

    /// Exponential glide from `a` to `b` over `over` seconds, then held.
    static func glide(_ a: Double, _ b: Double, _ t: Double, over: Double) -> Double {
        a * pow(b / a, min(max(t, 0) / over, 1))
    }

    /// Linear attack into an exponential decay.
    static func env(_ t: Double, attack: Double, decay: Double) -> Float {
        Float(t < attack ? t / attack : exp(-(t - attack) / decay))
    }

    /// Seeded white noise, so every launch sounds the same.
    struct Noise {
        private var state: UInt32
        init(_ seed: UInt32) { state = seed }
        mutating func next() -> Float {
            state = state &* 1_664_525 &+ 1_013_904_223
            return Float(state >> 8) / Float(1 << 23) - 1
        }
    }

    /// Zavalishin's topology-preserving state-variable filter. It stays stable
    /// while its cutoff sweeps, which is most of what these sounds do.
    struct SVF {
        private var ic1: Float = 0, ic2: Float = 0

        mutating func run(_ x: Float, cutoff: Double, q: Double) -> (low: Float, band: Float, high: Float) {
            let g = Float(tan(.pi * min(cutoff, rate * 0.45) / rate))
            let k = Float(1 / q)
            let a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2
            let v3 = x - ic2
            let v1 = a1 * ic1 + a2 * v3
            let v2 = ic2 + a2 * ic1 + a3 * v3
            ic1 = 2 * v1 - ic1
            ic2 = 2 * v2 - ic2
            return (v2, v1, x - k * v1 - v2)
        }
    }
}
