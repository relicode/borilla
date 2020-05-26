import pLimit, { Limit } from 'p-limit'
import { AudioContext, IAudioBufferSourceNode, IAudioContext } from 'standardized-audio-context'
import fetchPonyfill from 'fetch-ponyfill'
import mergeRight from 'ramda/src/mergeRight'

const { fetch } = fetchPonyfill()
const IS_BROWSER: boolean = typeof window === 'object' && window !== null
const IS_IOS: boolean = IS_BROWSER && /iPad|iPhone/.test(window.navigator && window.navigator.platform)


const createAudioContext = async (desiredSampleRate: 44100 | 48000 = 44100, options: AudioContextOptions = {}): Promise<AudioContext | undefined> => {
  if (!IS_BROWSER) {
    return undefined
  }

  const ctx = new AudioContext(options)

  // Check if hack is necessary. Only occurs in iOS6+ devices
  // and only when you first boot the iPhone, or play a audio/video
  // with a different sample rate
  if (IS_IOS && ctx.sampleRate !== desiredSampleRate) {
    const dummy = ctx.createBufferSource()
    dummy.buffer = ctx.createBuffer(1, 1, desiredSampleRate)
    dummy.connect(ctx.destination)
    dummy.start(0)
    dummy.disconnect()
    await ctx.close()
    return new AudioContext(options)
  }

  return ctx
}

// Use callback to circumvent iOS limitations
const decodeAudioData = (ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => (
  new Promise((resolve, reject) => {
    ctx.decodeAudioData(
      arrayBuffer,
      (decoded) => { resolve(decoded) },
      (e) => { reject(e.message) },
    )
  })
)

interface AudioUrls {
  [key: string]: string
}

interface AudioBuffers {
  [key: string]: AudioBuffer
}

interface DefaultBorillaOptions {
  isIos: boolean
  audioUrls: AudioUrls
  fetchLimit: number
}

interface BorillaOptions {
  isIos?: boolean
  audioUrls?: AudioUrls
  fetchLimit?: number
}

interface Borilla extends Omit<DefaultBorillaOptions, 'audioUrls' | 'fetchLimit'> {
  ctx: IAudioContext | undefined
  audioUrls?: AudioUrls
  audioBuffers?: AudioBuffers
  fetchLimit: Limit
  activeSources: {
    [key: string]: IAudioBufferSourceNode<IAudioContext>
  }
  sourceIdCounter: number
}

const defaultBorillaOptions: DefaultBorillaOptions = {
  isIos: IS_IOS,
  audioUrls: {},
  fetchLimit: Infinity,
} as const

const fetchAndDecode = async (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const decoded = await ctx.decodeAudioData(arrayBuffer)
  return decoded
}

const createBufferSource = (ctx: AudioContext, audioBuffer: AudioBuffer, loop: boolean = false) => {
  const src = ctx.createBufferSource()
  src.buffer = audioBuffer
  if (loop) {
    src.loop = true
  }
  src.connect(ctx.destination)
  return src
}

const generateSourceId = (() => {
  let counter = 0
  return () => {
    const counterString = String(counter)
    counter += 1
    return counterString
  }
})()

class Borilla implements Borilla {
  ctx: AudioContext | undefined
  constructor(opts: BorillaOptions = {}) {
    const options = mergeRight(defaultBorillaOptions, opts)
    this.isIos = options.isIos as boolean
    this.audioUrls = options.audioUrls as AudioUrls
    this.fetchLimit = pLimit(options.fetchLimit) as Limit
    this.activeSources = {}
    this.sourceIdCounter = 0
  }

  public async initialize(): Promise<void> {
    this.ctx = await createAudioContext()
    if (!this.ctx) {
      return
    }
    const ctx = this.ctx as AudioContext
    const { audioUrls } = this
    const arrayBuffers = Object.entries(audioUrls as AudioUrls).map(([url, buffer]) => [url, fetchAndDecode(ctx, buffer)])
    const audioBuffers = await Promise.all(arrayBuffers.map(([url, buffer]) => buffer as Promise<AudioBuffer>))
    this.audioBuffers = audioBuffers.reduce((acc, cur, idx) => ({
      ...acc,
      [arrayBuffers[idx][0] as string]: cur,
    }), {})
  }

  public play(audioBufferId: string, loop: boolean = false): string {
    const buffer = this.audioBuffers ? this.audioBuffers[audioBufferId] : undefined
    if (!buffer) { throw new Error('Undefined audio buffer') }

    const src = createBufferSource(this.ctx, this.audioBuffers[audioBufferId], loop)
    const id = generateSourceId()
    
    this.activeSources = { ...this.activeSources, [id]: src }
    src.onended = () => {
      const activeSources = { ...this.activeSources }
      delete activeSources[id]
      this.activeSources = activeSources
    }
    src.start(0)
    return id
  }

}

export default Borilla
