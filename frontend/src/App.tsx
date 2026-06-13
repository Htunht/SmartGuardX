import { useState, useEffect, useRef } from 'react'

const API_BASE = 'http://localhost:8000'

interface LogEntry {
  time: string
  message: string
}

interface SystemStatus {
  mode: string
  esp32_ip: string
  connected: boolean
  servo_angle: number
  current_direction: string
  logs: LogEntry[]
}

interface ApiResult {
  status?: string
  error?: string
  detail?: string | { msg: string }[]
}

// Sound effect synthesizer using Web Audio API (programmatic, no external files)
class CyberSynth {
  private ctx: AudioContext | null = null
  public enabled = true

  private initCtx() {
    if (!this.ctx) {
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
  }

  public playClick() {
    if (!this.enabled) return
    this.initCtx()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05)
      
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05)
      
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      
      osc.start()
      osc.stop(this.ctx.currentTime + 0.05)
    } catch (e) {
      console.warn('Audio error:', e)
    }
  }

  public playHover() {
    if (!this.enabled) return
    this.initCtx()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(800, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.03)
      
      gain.gain.setValueAtTime(0.012, this.ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.03)
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start()
      osc.stop(this.ctx.currentTime + 0.03)
    } catch (e) {
      console.warn('Audio error:', e)
    }
  }

  public playConnect() {
    if (!this.enabled) return
    this.initCtx()
    if (!this.ctx) return
    try {
      const t = this.ctx.currentTime
      const osc1 = this.ctx.createOscillator()
      const gain1 = this.ctx.createGain()
      osc1.frequency.setValueAtTime(520, t)
      gain1.gain.setValueAtTime(0.06, t)
      gain1.gain.linearRampToValueAtTime(0.0001, t + 0.08)
      osc1.connect(gain1)
      gain1.connect(this.ctx.destination)
      osc1.start(t)
      osc1.stop(t + 0.08)

      const osc2 = this.ctx.createOscillator()
      const gain2 = this.ctx.createGain()
      osc2.frequency.setValueAtTime(880, t + 0.08)
      gain2.gain.setValueAtTime(0.06, t + 0.08)
      gain2.gain.linearRampToValueAtTime(0.0001, t + 0.22)
      osc2.connect(gain2)
      gain2.connect(this.ctx.destination)
      osc2.start(t + 0.08)
      osc2.stop(t + 0.22)
    } catch (e) {
      console.warn('Audio error:', e)
    }
  }

  public playAlarm() {
    if (!this.enabled) return
    this.initCtx()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(140, this.ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(90, this.ctx.currentTime + 0.18)
      
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.18)
      
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      
      osc.start()
      osc.stop(this.ctx.currentTime + 0.18)
    } catch (e) {
      console.warn('Audio error:', e)
    }
  }
}

const synth = new CyberSynth()

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ApiResult
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(', ')
    return data.error || res.statusText || 'Request failed'
  } catch {
    return res.statusText || 'Request failed'
  }
}

function App() {
  const [mode, setMode] = useState<string>('demo')
  const [ip, setIp] = useState<string>('192.168.1.100')
  const [backendOnline, setBackendOnline] = useState(true)
  const [apiError, setApiError] = useState('')
  const [streamLive, setStreamLive] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<SystemStatus>({
    mode: 'demo',
    esp32_ip: '',
    connected: false,
    servo_angle: 90,
    current_direction: 'stop',
    logs: [],
  })

  // Creative UI Interactive States
  const [battery, setBattery] = useState(98)
  const [soundMuted, setSoundMuted] = useState(false)
  const [spectrum, setSpectrum] = useState<'normal' | 'night' | 'thermal'>('normal')
  const [pip, setPip] = useState(false)
  const [logFilter, setLogFilter] = useState<'all' | 'command' | 'warning' | 'error'>('all')
  const [latency, setLatency] = useState(4)
  const [cpuTemp, setCpuTemp] = useState(42)

  // Ref to track last sent direction to prevent duplicate network spam
  const lastDirectionRef = useRef<string>('stop')
  const [streamUrl, setStreamUrl] = useState<string>(`${API_BASE}/api/stream?mode=demo&t=${Date.now()}`)

  // Sync mute state to synth helper
  useEffect(() => {
    synth.enabled = !soundMuted
  }, [soundMuted])

  // Play alarms when offline errors toggle on
  const prevOfflineRef = useRef(false)
  useEffect(() => {
    if (!backendOnline && !prevOfflineRef.current) {
      synth.playAlarm()
    }
    prevOfflineRef.current = !backendOnline
  }, [backendOnline])

  const prevErrorRef = useRef('')
  useEffect(() => {
    if (apiError && apiError !== prevErrorRef.current) {
      synth.playAlarm()
    }
    prevErrorRef.current = apiError
  }, [apiError])

  // Simulate Battery drain
  useEffect(() => {
    const batteryTimer = setInterval(() => {
      setBattery((prev) => {
        if (prev <= 5) return 99 // loop recharge
        return prev - 1
      })
    }, 12000)
    return () => clearInterval(batteryTimer)
  }, [])

  // Telemetry fluctuation simulator based on backend polling updates
  useEffect(() => {
    // Latency
    const lMin = status.mode === 'esp32' ? (status.connected ? 42 : 0) : 2
    const lMax = status.mode === 'esp32' ? (status.connected ? 85 : 0) : 5
    const computedLatency = lMin === 0 ? 0 : Math.floor(Math.random() * (lMax - lMin + 1)) + lMin
    setLatency(computedLatency)

    // CPU Temperature
    const tBase = status.mode === 'webcam' ? 53 : (status.mode === 'esp32' ? 47 : 41)
    const computedTemp = tBase + Math.floor(Math.random() * 3) - 1
    setCpuTemp(computedTemp)
  }, [status])

  // Fetch status from API
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`)
      if (res.ok) {
        const data = await res.json()
        setBackendOnline(true)
        setApiError('')
        setStatus(data)
        setMode(data.mode)
        if (data.esp32_ip) {
          setIp(data.esp32_ip)
        }
      } else {
        setBackendOnline(true)
        setApiError(await parseApiError(res))
      }
    } catch (err) {
      setBackendOnline(false)
      setApiError('Backend API unreachable. Start the Python server on port 8000.')
      console.error('Failed to fetch status from API backend:', err)
    }
  }

  // Poll status every 1 second
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  // Send movement commands
  const sendMoveCommand = async (dir: string) => {
    if (dir === lastDirectionRef.current) return
    
    // Play synth sound on transitions
    if (dir !== 'stop') {
      synth.playClick()
    } else {
      synth.playHover()
    }

    lastDirectionRef.current = dir
    
    // Update local UI immediately for responsiveness
    setStatus((prev) => ({ ...prev, current_direction: dir }))

    try {
      const res = await fetch(`${API_BASE}/api/control/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: dir }),
      })
      if (res.ok) {
        const data = (await res.json()) as ApiResult
        if (data.status === 'failed') {
          setApiError(data.error || 'ESP32 movement command failed')
        } else {
          setApiError('')
        }
        fetchStatus()
      } else {
        setApiError(await parseApiError(res))
      }
    } catch (err) {
      setBackendOnline(false)
      setApiError('Backend API unreachable. Movement command not sent.')
      console.error('Error sending move command:', err)
    }
  }

  // Send camera pan commands
  const sendPanCommand = async (angle: number) => {
    setStatus((prev) => ({ ...prev, servo_angle: angle }))
    synth.playHover()
    try {
      const res = await fetch(`${API_BASE}/api/control/pan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angle }),
      })
      if (res.ok) {
        const data = (await res.json()) as ApiResult
        if (data.status === 'failed') {
          setApiError(data.error || 'ESP32 pan command failed')
        } else {
          setApiError('')
        }
        fetchStatus()
      } else {
        setApiError(await parseApiError(res))
      }
    } catch (err) {
      setBackendOnline(false)
      setApiError('Backend API unreachable. Pan command not sent.')
      console.error('Error sending pan command:', err)
    }
  }

  // Send connection/mode update
  const handleConnect = async () => {
    setConnecting(true)
    setApiError('')
    synth.playConnect()
    try {
      const res = await fetch(`${API_BASE}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ip }),
      })
      if (res.ok) {
        const data = await res.json()
        setBackendOnline(true)
        setStatus(data)
        setStreamLive(false)
        setStreamUrl(`${API_BASE}/api/stream?mode=${mode}&t=${Date.now()}`)
      } else {
        setApiError(await parseApiError(res))
      }
    } catch (err) {
      setBackendOnline(false)
      setApiError('Backend API unreachable. Could not apply connection mode.')
      console.error('Failed to change mode/connect:', err)
    } finally {
      setConnecting(false)
    }
  }

  // Global Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return

      let direction = ''
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          direction = 'forward'
          break
        case 's':
        case 'arrowdown':
          direction = 'backward'
          break
        case 'a':
        case 'arrowleft':
          direction = 'left'
          break
        case 'd':
        case 'arrowright':
          direction = 'right'
          break
        case ' ':
        case 'escape':
          direction = 'stop'
          break
        default:
          return
      }
      
      e.preventDefault()
      sendMoveCommand(direction)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return

      let releasedDir = ''
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          releasedDir = 'forward'
          break
        case 's':
        case 'arrowdown':
          releasedDir = 'backward'
          break
        case 'a':
        case 'arrowleft':
          releasedDir = 'left'
          break
        case 'd':
        case 'arrowright':
          releasedDir = 'right'
          break
        default:
          return
      }

      if (releasedDir === lastDirectionRef.current) {
        sendMoveCommand('stop')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [status.mode]) // refresh event listeners if mode toggles

  // Helper to check if a specific button is active
  const isDirActive = (dir: string) => status.current_direction === dir

  // Helper to determine log line class styles
  const getLogClass = (message: string) => {
    const msg = message.toLowerCase()
    if (msg.includes('error') || msg.includes('fail')) return 'log-entry error'
    if (msg.includes('warning') || msg.includes('warn')) return 'log-entry warning'
    if (msg.includes('command') || msg.includes('move') || msg.includes('pan')) return 'log-entry command'
    return 'log-entry info'
  }

  // Filter logs locally based on filter state selection
  const filteredLogs = (status.logs || []).filter((log) => {
    if (logFilter === 'all') return true
    const msg = log.message.toLowerCase()
    if (logFilter === 'command') return msg.includes('command') || msg.includes('move') || msg.includes('pan') || msg.includes('direction') || msg.includes('servo')
    if (logFilter === 'warning') return msg.includes('warning') || msg.includes('warn')
    if (logFilter === 'error') return msg.includes('error') || msg.includes('fail')
    return true
  })

  return (
    <>
      {!backendOnline && (
        <div className="setup-alert setup-alert-critical" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Backend offline — run <code>uvicorn main:app --reload</code> in the backend folder (port 8000).</span>
        </div>
      )}

      {backendOnline && apiError && (
        <div className="setup-alert setup-alert-warning" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>{apiError}</span>
        </div>
      )}

      {backendOnline && !apiError && status.mode === 'esp32' && !status.connected && (
        <div className="setup-alert setup-alert-info" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>ESP32 mode active. Enter the device IP from Serial Monitor, click Apply, then confirm the stream connects.</span>
        </div>
      )}

      {/* Header */}
      <header className="dashboard-header" id="dashboard-header-container">
        <div className="brand-section">
          <h1 className="brand-title" id="main-title">SMART GUARDX</h1>
          <span className="brand-subtitle">ROBOTIC SECURITY CORE v1.0.0</span>
        </div>
        
        <div className="status-bar">
          {/* Mute Audio Synthesizer toggle */}
          <button 
            type="button" 
            className={`mute-toggle-btn ${soundMuted ? 'active' : ''}`}
            title={soundMuted ? 'Unmute UI Audio Synth' : 'Mute UI Audio Synth'}
            onMouseEnter={() => synth.playHover()}
            onClick={() => {
              synth.playClick()
              setSoundMuted(!soundMuted)
            }}
          >
            {soundMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.1 15"></path>
                <path d="M21 3v2"></path>
                <path d="M3 9h4l5-5v14l-5-5H3z"></path>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            )}
          </button>

          <div 
            className={`status-indicator ${
              status.mode === 'esp32' 
                ? status.connected ? 'connected' : 'disconnected' 
                : status.mode === 'webcam' ? 'connected' : 'demo'
            }`}
            id="connection-status-badge"
          >
            <div className="status-dot"></div>
            <span>
              {status.mode === 'esp32' 
                ? status.connected ? 'ESP32 ONLINE' : 'ESP32 OFFLINE' 
                : status.mode === 'webcam' ? 'WEBCAM ACTIVE' : 'SIMULATION MODE'}
            </span>
          </div>
        </div>
      </header>

      {/* Grid Content */}
      <main className="dashboard-grid" id="main-dashboard-grid">
        
        {/* Left Column: Live Feed Panel with CSS filter spectrums and mini-PIP support */}
        <section className={`feed-panel cyber-card ${pip ? 'pip-active' : ''}`} id="feed-panel-container">
          <div className="cyber-corner cyber-corner-tl"></div>
          <div className="cyber-corner cyber-corner-tr"></div>
          <div className="cyber-corner cyber-corner-bl"></div>
          <div className="cyber-corner cyber-corner-br"></div>

          <div className="panel-header">
            <h2 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              LIVE SECURITY VIEWPORT
            </h2>

            {/* Visual Spectrum Filters selection */}
            <div className="spectrum-selector">
              <button 
                type="button" 
                className={`spectrum-btn ${spectrum === 'normal' ? 'active normal' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setSpectrum('normal')
                }}
              >
                NORMAL
              </button>
              <button 
                type="button" 
                className={`spectrum-btn ${spectrum === 'night' ? 'active night' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setSpectrum('night')
                }}
              >
                NIGHT
              </button>
              <button 
                type="button" 
                className={`spectrum-btn ${spectrum === 'thermal' ? 'active thermal' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setSpectrum('thermal')
                }}
              >
                THERMAL
              </button>
            </div>
          </div>
          
          <div className="feed-stream-container">
            {/* Tech grid overlay */}
            <div className="feed-grid-bg"></div>

            {/* HUD Overlay */}
            <div className="feed-hud-overlay">
              <div className="hud-top">
                <div className="hud-group">
                  <span className="hud-label">CAM SOURCE</span>
                  <span className="hud-value">{status.mode.toUpperCase()}</span>
                </div>
                <div className="hud-group">
                  <span className="hud-label">TELEMETRY</span>
                  <span className={`hud-value ${streamLive ? 'live' : 'offline'}`}>
                    {streamLive ? (
                      <>
                        <span className="hud-rec-dot"></span>
                        REC
                      </>
                    ) : (
                      'OFFLINE'
                    )}
                  </span>
                </div>
              </div>
              
              <div className="hud-top" style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
                <div className="hud-group">
                  <span className="hud-label">DRIVE UNIT</span>
                  <span className="hud-value" style={{ color: status.current_direction !== 'stop' ? '#39ff14' : '#ff0055' }}>
                    {status.current_direction.toUpperCase()}
                  </span>
                </div>
                
                {/* Floating PIP toggle for small responsive screens */}
                <button 
                  type="button" 
                  className="pip-control-btn" 
                  onMouseEnter={() => synth.playHover()}
                  onClick={() => {
                    synth.playClick()
                    setPip(!pip)
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <rect x="13" y="13" width="8" height="8" rx="1" ry="1"></rect>
                  </svg>
                  <span>{pip ? 'RESTORE' : 'FLOAT'}</span>
                </button>
              </div>
            </div>

            {/* CRT TV Filter effects */}
            <div className="feed-scanlines"></div>
            <div className="feed-vignette"></div>

            {/* Stream Image */}
            <img 
              src={streamUrl} 
              alt="Security Feed" 
              className={`feed-image filter-${spectrum}`}
              id="security-feed-img"
              onLoad={() => setStreamLive(true)}
              onError={() => {
                setStreamLive(false)
                setTimeout(() => {
                  setStreamUrl(`${API_BASE}/api/stream?mode=${status.mode}&t=${Date.now()}`)
                }, 2000)
              }}
            />
          </div>

          {/* Telemetry Dashboard Widgets */}
          <div className="telemetry-panel">
            <div className="telemetry-widget">
              <div className="telemetry-header">
                <span className="telemetry-title">SYS POWER</span>
                <span className="telemetry-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect>
                    <line x1="23" y1="11" x2="23" y2="13"></line>
                  </svg>
                </span>
              </div>
              <div className="telemetry-content">
                <span className="telemetry-val" style={{ color: battery > 50 ? '#39ff14' : battery > 20 ? '#ffaa00' : '#ff0055' }}>
                  {battery}
                </span>
                <span className="telemetry-unit">%</span>
              </div>
              <div className="widget-progress-bg">
                <div 
                  className={`widget-progress-fill ${battery > 50 ? 'green' : battery > 20 ? 'amber' : 'red'}`} 
                  style={{ width: `${battery}%` }}
                ></div>
              </div>
            </div>

            <div className="telemetry-widget">
              <div className="telemetry-header">
                <span className="telemetry-title">THERMAL CPU</span>
                <span className="telemetry-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
                  </svg>
                </span>
              </div>
              <div className="telemetry-content">
                <span className="telemetry-val" style={{ color: cpuTemp > 50 ? '#ffaa00' : '#00f0ff' }}>
                  {cpuTemp}
                </span>
                <span className="telemetry-unit">°C</span>
              </div>
              <div className="widget-progress-bg">
                <div 
                  className="widget-progress-fill" 
                  style={{ 
                    width: `${Math.min(100, Math.max(10, ((cpuTemp - 20) / 60) * 100))}%`,
                    background: cpuTemp > 50 ? 'var(--neon-amber)' : 'var(--neon-cyan)',
                    boxShadow: cpuTemp > 50 ? '0 0 8px var(--neon-amber-glow)' : '0 0 8px var(--neon-cyan-glow)'
                  }}
                ></div>
              </div>
            </div>

            <div className="telemetry-widget">
              <div className="telemetry-header">
                <span className="telemetry-title">NET LATENCY</span>
                <span className="telemetry-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                    <line x1="12" y1="20" x2="12.01" y2="20"></line>
                  </svg>
                </span>
              </div>
              <div className="telemetry-content">
                <span className="telemetry-val" style={{ color: latency === 0 ? '#ff0055' : latency > 60 ? '#ffaa00' : '#39ff14' }}>
                  {latency === 0 ? '---' : latency}
                </span>
                <span className="telemetry-unit">ms</span>
              </div>
              <div className="widget-progress-bg">
                <div 
                  className="widget-progress-fill" 
                  style={{ 
                    width: latency === 0 ? '0%' : `${Math.min(100, (latency / 120) * 100)}%`,
                    background: latency > 60 ? 'var(--neon-amber)' : 'var(--neon-green)',
                    boxShadow: latency > 60 ? '0 0 8px var(--neon-amber-glow)' : '0 0 8px var(--neon-green-glow)'
                  }}
                ></div>
              </div>
            </div>

            <div className="telemetry-widget" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span className="telemetry-title">SERVO PAN</span>
                <div className="telemetry-content">
                  <span className="telemetry-val" style={{ color: 'var(--neon-cyan)' }}>{status.servo_angle}</span>
                  <span className="telemetry-unit">DEG</span>
                </div>
              </div>
              
              {/* Rotating Compass Indicator mapped to servo pan angle */}
              <div className="compass-wheel-container" title="Camera Pan Orientation Angle">
                <div className="compass-wheel-inner" style={{ transform: `rotate(${status.servo_angle - 90}deg)` }}>
                  <div className="compass-pointer"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Controls Sidebar */}
        <section className="control-sidebar" id="control-sidebar-container">
          
          {/* Card 1: Connection setup */}
          <div className="control-card cyber-card" id="connection-setup-card">
            <div className="cyber-corner cyber-corner-tl"></div>
            <div className="cyber-corner cyber-corner-tr"></div>
            <div className="cyber-corner cyber-corner-bl"></div>
            <div className="cyber-corner cyber-corner-br"></div>

            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 0 1 0 12.73"></path>
                <path d="M6.01 6.64a9 9 0 0 0 0 12.73"></path>
                <path d="M15.54 9.46a5 5 0 0 1 0 5.09"></path>
                <path d="M8.46 9.46a5 5 0 0 0 0 5.09"></path>
                <circle cx="12" cy="12" r="1"></circle>
              </svg>
              CONNECTION CONTROLLER
            </h2>
            
            <div className="mode-selector" id="mode-selector-buttons">
              <button 
                type="button"
                className={`mode-btn ${mode === 'demo' ? 'active' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setMode('demo')
                }}
              >
                Demo
              </button>
              <button 
                type="button"
                className={`mode-btn ${mode === 'webcam' ? 'active' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setMode('webcam')
                }}
              >
                Webcam
              </button>
              <button 
                type="button"
                className={`mode-btn ${mode === 'esp32' ? 'active' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setMode('esp32')
                }}
              >
                ESP32
              </button>
            </div>

            <div className="ip-input-group">
              <label htmlFor="esp32-ip-field" className="servo-value-display">
                <span>ESP32-CAM TARGET IP</span>
              </label>
              <div className="ip-input-wrapper">
                <input 
                  type="text" 
                  id="esp32-ip-field" 
                  className="ip-input" 
                  placeholder="e.g. 192.168.1.100" 
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  disabled={mode !== 'esp32'}
                />
                <button 
                  type="button" 
                  className="connect-btn"
                  onClick={handleConnect}
                  id="connect-submit-btn"
                  disabled={connecting || !backendOnline}
                >
                  {connecting ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Camera Pan Slider */}
          <div className="control-card cyber-card" id="camera-pan-card">
            <div className="cyber-corner cyber-corner-tl"></div>
            <div className="cyber-corner cyber-corner-tr"></div>
            <div className="cyber-corner cyber-corner-bl"></div>
            <div className="cyber-corner cyber-corner-br"></div>

            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M16.2 7.8l-2.2 2.2c-.8-.2-1.7-.2-2.5 0L9.3 7.8m0 8.4l2.2-2.2c.8.2 1.7.2 2.5 0l2.2 2.2"></path>
              </svg>
              CAMERA SERVO PAN
            </h2>
            
            <div className="servo-value-display">
              <span>ANGLE SWEEP CONTROL</span>
              <span>HEADING: <span className="servo-value">{status.servo_angle}°</span></span>
            </div>

            <input 
              type="range" 
              className="servo-range" 
              min="0" 
              max="180" 
              value={status.servo_angle} 
              id="camera-pan-slider"
              onChange={(e) => sendPanCommand(parseInt(e.target.value))}
            />

            <div className="servo-presets" id="pan-preset-buttons">
              <button 
                type="button" 
                className="servo-btn" 
                onMouseEnter={() => synth.playHover()}
                onClick={() => sendPanCommand(0)}
              >
                0° Left
              </button>
              <button 
                type="button" 
                className="servo-btn" 
                onMouseEnter={() => synth.playHover()}
                onClick={() => sendPanCommand(90)}
              >
                90° Center
              </button>
              <button 
                type="button" 
                className="servo-btn" 
                onMouseEnter={() => synth.playHover()}
                onClick={() => sendPanCommand(180)}
              >
                180° Right
              </button>
            </div>
          </div>

          {/* Card 3: Robot movement D-Pad */}
          <div className="control-card cyber-card" id="movement-control-card">
            <div className="cyber-corner cyber-corner-tl"></div>
            <div className="cyber-corner cyber-corner-tr"></div>
            <div className="cyber-corner cyber-corner-bl"></div>
            <div className="cyber-corner cyber-corner-br"></div>

            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 9 2 12 5 15"></polyline>
                <polyline points="9 5 12 2 15 5"></polyline>
                <polyline points="15 19 12 22 9 19"></polyline>
                <polyline points="19 9 22 12 19 15"></polyline>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="12" y1="2" x2="12" y2="22"></line>
              </svg>
              ROBOT VEHICLE COMMANDS
            </h2>

            <div className="dpad-container" id="movement-dpad-controls">
              <div className="dpad-grid">
                
                {/* Row 1 */}
                <div className="dpad-btn empty"></div>
                <button 
                  type="button" 
                  className={`dpad-btn ${isDirActive('forward') ? 'active' : ''}`}
                  id="dpad-forward-btn"
                  onMouseEnter={() => synth.playHover()}
                  onMouseDown={() => sendMoveCommand('forward')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('forward')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                  <span className="key-hint">W</span>
                </button>
                <div className="dpad-btn empty"></div>

                {/* Row 2 */}
                <button 
                  type="button" 
                  className={`dpad-btn ${isDirActive('left') ? 'active' : ''}`}
                  id="dpad-left-btn"
                  onMouseEnter={() => synth.playHover()}
                  onMouseDown={() => sendMoveCommand('left')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('left')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  <span className="key-hint">A</span>
                </button>
                
                <button 
                  type="button" 
                  className={`dpad-btn stop-btn ${isDirActive('stop') ? 'active' : ''}`}
                  id="dpad-stop-btn"
                  onMouseEnter={() => synth.playHover()}
                  onClick={() => sendMoveCommand('stop')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  </svg>
                  <span className="key-hint" style={{ right: '4px' }}>Space</span>
                </button>
                
                <button 
                  type="button" 
                  className={`dpad-btn ${isDirActive('right') ? 'active' : ''}`}
                  id="dpad-right-btn"
                  onMouseEnter={() => synth.playHover()}
                  onMouseDown={() => sendMoveCommand('right')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('right')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <span className="key-hint">D</span>
                </button>

                {/* Row 3 */}
                <div className="dpad-btn empty"></div>
                <button 
                  type="button" 
                  className={`dpad-btn ${isDirActive('backward') ? 'active' : ''}`}
                  id="dpad-backward-btn"
                  onMouseEnter={() => synth.playHover()}
                  onMouseDown={() => sendMoveCommand('backward')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('backward')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  <span className="key-hint">S</span>
                </button>
                <div className="dpad-btn empty"></div>

              </div>
              
              <div className="dpad-instruction">
                Press **W, A, S, D** or **Arrow Keys** to steer. Press **Space** or **Escape** to STOP immediately.
              </div>
            </div>
          </div>

        </section>

        {/* Bottom Drawer: Logs list with Event Filters */}
        <section className="logs-panel cyber-card" id="system-logs-panel-container">
          <div className="cyber-corner cyber-corner-tl"></div>
          <div className="cyber-corner cyber-corner-tr"></div>
          <div className="cyber-corner cyber-corner-bl"></div>
          <div className="cyber-corner cyber-corner-br"></div>

          <div className="panel-header">
            <h2 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              SYSTEM LOGGER & TELEMETRY STREAM
            </h2>

            {/* Quick logs filters */}
            <div className="log-filters-container">
              <button 
                type="button" 
                className={`log-filter-btn ${logFilter === 'all' ? 'active all' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setLogFilter('all')
                }}
              >
                ALL
              </button>
              <button 
                type="button" 
                className={`log-filter-btn ${logFilter === 'command' ? 'active command' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setLogFilter('command')
                }}
              >
                COMMANDS
              </button>
              <button 
                type="button" 
                className={`log-filter-btn ${logFilter === 'warning' ? 'active warning' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setLogFilter('warning')
                }}
              >
                WARNINGS
              </button>
              <button 
                type="button" 
                className={`log-filter-btn ${logFilter === 'error' ? 'active error' : ''}`}
                onMouseEnter={() => synth.playHover()}
                onClick={() => {
                  synth.playClick()
                  setLogFilter('error')
                }}
              >
                ERRORS
              </button>
            </div>
          </div>
          
          <div className="logs-container" id="logs-list-box">
            {filteredLogs && filteredLogs.length > 0 ? (
              filteredLogs.map((log, index) => (
                <div key={`${log.time}-${index}`} className={getLogClass(log.message)}>
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="log-entry info">
                <span className="log-time">[-:-:-]</span>
                <span className="log-msg">No logs matching selected category filters.</span>
              </div>
            )}
          </div>
        </section>

      </main>
    </>
  )
}

export default App
