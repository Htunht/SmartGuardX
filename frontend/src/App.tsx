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

  // Ref to track last sent direction to prevent duplicate network spam
  const lastDirectionRef = useRef<string>('stop')
  const [streamUrl, setStreamUrl] = useState<string>(`${API_BASE}/api/stream?mode=demo&t=${Date.now()}`)

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
      // Don't trigger movement controls if the user is typing in the IP address input box
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

      // Stop the car only if the currently active moving direction is released
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
  }, [])

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

  return (
    <>
      {!backendOnline && (
        <div className="setup-alert setup-alert-critical" role="alert">
          Backend offline — run <code>uvicorn main:app --reload</code> in the backend folder (port 8000).
        </div>
      )}

      {backendOnline && apiError && (
        <div className="setup-alert setup-alert-warning" role="alert">
          {apiError}
        </div>
      )}

      {backendOnline && !apiError && status.mode === 'esp32' && !status.connected && (
        <div className="setup-alert setup-alert-info" role="status">
          ESP32 mode active. Enter the device IP from Serial Monitor, click Apply, then confirm the stream connects.
        </div>
      )}

      {/* Header */}
      <header className="dashboard-header" id="dashboard-header-container">
        <div className="brand-section">
          <h1 className="brand-title" id="main-title">SMART GUARDX</h1>
          <span className="brand-subtitle">ROBOTIC SECURITY CORE v1.0.0</span>
        </div>
        
        <div className="status-bar">
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
        
        {/* Left Column: Live Feed */}
        <section className="feed-panel" id="feed-panel-container">
          <div className="panel-header">
            <h2 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              LIVE VIDEO STREAM FEED
            </h2>
          </div>
          
          <div className="feed-stream-container">
            {/* HUD Overlay */}
            <div className="feed-hud-overlay">
              <div className="hud-top">
                <div className="hud-group">
                  <span className="hud-label">CAM SOURCE</span>
                  <span className="hud-value">{status.mode.toUpperCase()}</span>
                </div>
                <div className="hud-group">
                  <span className="hud-label">SIGNAL</span>
                  <span className={`hud-value ${streamLive ? 'live' : 'offline'}`}>
                    {streamLive ? (
                      <>
                        <span className="hud-rec-dot"></span>
                        LIVE
                      </>
                    ) : (
                      'OFFLINE'
                    )}
                  </span>
                </div>
              </div>
              
              <div className="hud-top" style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
                <div className="hud-group">
                  <span className="hud-label">DRIVE</span>
                  <span className="hud-value" style={{ color: status.current_direction !== 'stop' ? '#10b981' : '#f43f5e' }}>
                    {status.current_direction.toUpperCase()}
                  </span>
                </div>
                <div className="hud-group">
                  <span className="hud-label">PAN</span>
                  <span className="hud-value">{status.servo_angle}°</span>
                </div>
              </div>
            </div>

            {/* CRT TV Filter effects */}
            <div className="feed-scanlines"></div>
            <div className="feed-vignette"></div>

            {/* Stream Image */}
            <img 
              src={streamUrl} 
              alt="Security Feed" 
              className="feed-image"
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
        </section>

        {/* Right Column: Controls Sidebar */}
        <section className="control-sidebar" id="control-sidebar-container">
          
          {/* Card 1: Connection setup */}
          <div className="control-card" id="connection-setup-card">
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
                onClick={() => setMode('demo')}
              >
                Demo
              </button>
              <button 
                type="button"
                className={`mode-btn ${mode === 'webcam' ? 'active' : ''}`}
                onClick={() => setMode('webcam')}
              >
                Webcam
              </button>
              <button 
                type="button"
                className={`mode-btn ${mode === 'esp32' ? 'active' : ''}`}
                onClick={() => setMode('esp32')}
              >
                ESP32
              </button>
            </div>

            <div className="ip-input-group">
              <label htmlFor="esp32-ip-field" className="servo-value-display">
                <span>ESP32-CAM IP ADDRESS</span>
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
          <div className="control-card" id="camera-pan-card">
            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"></path>
              </svg>
              CAMERA SERVO PAN
            </h2>
            
            <div className="servo-value-display">
              <span>ANGLE LIMITS: [0° - 180°]</span>
              <span>CURRENT: <span className="servo-value">{status.servo_angle}°</span></span>
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
              <button type="button" className="servo-btn" onClick={() => sendPanCommand(0)}>0° Left</button>
              <button type="button" className="servo-btn" onClick={() => sendPanCommand(90)}>90° Center</button>
              <button type="button" className="servo-btn" onClick={() => sendPanCommand(180)}>180° Right</button>
            </div>
          </div>

          {/* Card 3: Robot movement D-Pad */}
          <div className="control-card" id="movement-control-card">
            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 9 2 12 5 15"></polyline>
                <polyline points="9 5 12 2 15 5"></polyline>
                <polyline points="15 19 12 22 9 19"></polyline>
                <polyline points="19 9 22 12 19 15"></polyline>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="12" y1="2" x2="12" y2="22"></line>
              </svg>
              ROBOT MOVEMENT (D-PAD)
            </h2>

            <div className="dpad-container" id="movement-dpad-controls">
              <div className="dpad-grid">
                
                {/* Row 1 */}
                <div className="dpad-btn empty"></div>
                <button 
                  type="button" 
                  className={`dpad-btn ${isDirActive('forward') ? 'active' : ''}`}
                  id="dpad-forward-btn"
                  onMouseDown={() => sendMoveCommand('forward')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('forward')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
                  onMouseDown={() => sendMoveCommand('left')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('left')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  <span className="key-hint">A</span>
                </button>
                
                <button 
                  type="button" 
                  className={`dpad-btn stop-btn ${isDirActive('stop') ? 'active' : ''}`}
                  id="dpad-stop-btn"
                  onClick={() => sendMoveCommand('stop')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  </svg>
                  <span className="key-hint" style={{ right: '4px' }}>Space</span>
                </button>
                
                <button 
                  type="button" 
                  className={`dpad-btn ${isDirActive('right') ? 'active' : ''}`}
                  id="dpad-right-btn"
                  onMouseDown={() => sendMoveCommand('right')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('right')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
                  onMouseDown={() => sendMoveCommand('backward')}
                  onMouseUp={() => sendMoveCommand('stop')}
                  onMouseLeave={() => sendMoveCommand('stop')}
                  onTouchStart={() => sendMoveCommand('backward')}
                  onTouchEnd={() => sendMoveCommand('stop')}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  <span className="key-hint">S</span>
                </button>
                <div className="dpad-btn empty"></div>

              </div>
              
              <div className="dpad-instruction">
                Use **W, A, S, D** or **Arrow Keys** to steer the robot. Press **Space** or **Escape** to STOP immediately.
              </div>
            </div>
          </div>

        </section>

        {/* Bottom Drawer: Logs list */}
        <section className="logs-panel" id="system-logs-panel-container">
          <div className="panel-header">
            <h2 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              SYSTEM EVENT LOGGER & TELEMETRY
            </h2>
          </div>
          
          <div className="logs-container" id="logs-list-box">
            {status.logs && status.logs.length > 0 ? (
              status.logs.map((log, index) => (
                <div key={`${log.time}-${index}`} className={getLogClass(log.message)}>
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="log-entry info">
                <span className="log-time">[-:-:-]</span>
                <span className="log-msg">Waiting for system telemetry logs...</span>
              </div>
            )}
          </div>
        </section>

      </main>
    </>
  )
}

export default App
