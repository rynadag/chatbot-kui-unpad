import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2,
  Wifi,
  X,
  Trash2,
  Clock,
  Activity,
  Terminal,
} from 'lucide-react';

type MonitorEvent = {
  ts: number;
  type: string;
  request_id?: string;
  message?: string;
  reply?: string;
  user_message?: string;
  raw?: unknown;
  client_id?: string;
  user_agent?: string;
};

function parseBrowser(userAgent?: string) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/') || ua.includes('edge/')) return 'Edge';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('chrome') && !ua.includes('edg/') && !ua.includes('opr/'))
    return 'Chrome';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
  return 'Other';
}

export default function MonitorView() {
  const [connected, setConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);

  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const activeRequestsRef = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);

  const startTimesRef = useRef<number[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // active clients tracked by client_id -> metadata
  const [activeClients, setActiveClients] = useState<
    Record<
      string,
      { user_agent?: string; first_seen: number; last_seen: number }
    >
  >({});

  const MAX_EVENTS = 500;

  const pushEvent = useCallback((e: MonitorEvent) => {
    setEvents((prev) => {
      const next = [e, ...prev].slice(0, MAX_EVENTS);
      return next;
    });
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('ws://localhost:8080/ws-monitor');
      wsRef.current = ws;
    } catch (err: unknown) {
      setSocketError(String(err || 'Failed to create WebSocket'));
      return;
    }

    ws.onopen = () => {
      setConnected(true);
      setSocketError(null);
      pushEvent({
        ts: Date.now(),
        type: 'monitor_connect',
        message: 'Monitor socket connected',
      });
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const base: MonitorEvent = {
          ts: Date.now(),
          type: data.type || 'unknown',
          request_id: data.request_id,
          message: data.message,
          reply: data.reply,
          user_message: data.user_message,
          raw: data,
          client_id: data.client_id,
          user_agent: data.user_agent,
        };

        // client connect / disconnect handling
        if (data.type === 'monitor_client_connect') {
          const id = data.client_id;
          if (id) {
            setActiveClients((prev) => {
              if (prev[id]) {
                // update last seen
                return {
                  ...prev,
                  [id]: { ...prev[id], last_seen: Date.now() },
                };
              }
              return {
                ...prev,
                [id]: {
                  user_agent: data.user_agent,
                  first_seen: Date.now(),
                  last_seen: Date.now(),
                },
              };
            });
          }
          pushEvent(base);
          return;
        }

        if (data.type === 'monitor_client_disconnect') {
          const id = data.client_id;
          if (id) {
            setActiveClients((prev) => {
              const copy = { ...prev };
              delete copy[id];
              return copy;
            });
          }
          pushEvent(base);
          return;
        }

        // treat user_message events to ensure client presence known (some clients might not send hello)
        if (data.type === 'monitor_user_message') {
          const id = data.client_id;
          if (id) {
            setActiveClients((prev) => {
              if (prev[id]) {
                return {
                  ...prev,
                  [id]: { ...prev[id], last_seen: Date.now() },
                };
              }
              // unknown before — create entry using user_agent if available
              return {
                ...prev,
                [id]: {
                  user_agent: data.user_agent,
                  first_seen: Date.now(),
                  last_seen: Date.now(),
                },
              };
            });
          }
          // also track request starts
          if (data.request_id) {
            if (!activeRequestsRef.current.has(data.request_id)) {
              activeRequestsRef.current.add(data.request_id);
              startTimesRef.current.push(Date.now());
              forceRerender((n) => n + 1);
            }
          }
          pushEvent(base);
          return;
        }

        if (data.type === 'monitor_progress') {
          pushEvent(base);
          return;
        }

        if (data.type === 'monitor_reply') {
          if (
            data.request_id &&
            activeRequestsRef.current.has(data.request_id)
          ) {
            activeRequestsRef.current.delete(data.request_id);
            forceRerender((n) => n + 1);
          }
          pushEvent(base);
          return;
        }

        // fallback
        pushEvent(base);
      } catch (err) {
        pushEvent({
          ts: Date.now(),
          type: 'parse_error',
          message: String(err),
          raw: ev.data,
        });
      }
    };

    ws.onclose = () => {
      setConnected(false);
      pushEvent({
        ts: Date.now(),
        type: 'monitor_disconnect',
        message: 'Monitor socket closed',
      });
    };

    ws.onerror = (err) => {
      setSocketError('WebSocket error');
      pushEvent({
        ts: Date.now(),
        type: 'monitor_error',
        message: 'WebSocket reported an error',
        raw: err,
      });
    };

    return () => {
      try {
        ws?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [pushEvent]);

  // compute requests per last 60s (rolling)
  const requestsLast60s = (() => {
    const now = Date.now();
    const cutoff = now - 60_000;
    startTimesRef.current = startTimesRef.current.filter((t) => t >= cutoff);
    return startTimesRef.current.length;
  })();

  // compute browser breakdown
  const clientEntries = Object.entries(activeClients);
  const browserCounts = clientEntries.reduce<Record<string, number>>(
    (acc, [, meta]) => {
      // <--- UBAH [id, meta] MENJADI [, meta]
      const b = parseBrowser(meta.user_agent);
      acc[b] = (acc[b] || 0) + 1;
      return acc;
    },
    {}
  );
  const activeCount = clientEntries.length;

  const clearEvents = () => setEvents([]);
  const disconnectMonitor = () => {
    try {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    } catch {}
  };

  return (
    <div className='p-4 h-full flex flex-col'>
      <header className='mb-6 flex justify-between items-center bg-white/70 backdrop-blur-md p-4 rounded-xl border border-white/50 shadow-sm'>
        <div>
          <h1 className='text-2xl font-bold text-[#13484f] tracking-tight'>
            Live Monitor
          </h1>
          <p className='text-sm text-gray-600 mt-1'>
            Real-time overview of chatbot usage & events.
          </p>
        </div>

        <div className='flex items-center gap-3'>
          {socketError && (
            <div className='px-3 py-1.5 rounded-lg bg-red-100 border border-red-200 text-red-700 text-xs font-medium'>
              Error: {socketError}
            </div>
          )}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm backdrop-blur-sm ${
              connected
                ? 'bg-emerald-100/50 border-emerald-200 text-emerald-800'
                : 'bg-red-100/50 border-red-200 text-red-800'
            }`}
          >
            <Wifi className='w-4 h-4' />
            <div>
              <div className='text-[10px] opacity-70 uppercase tracking-wider font-bold'>
                Socket
              </div>
              <div className='text-xs font-semibold'>
                {connected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>

          {connected && (
            <button
              onClick={disconnectMonitor}
              className='p-2 rounded-lg bg-white/70 hover:bg-red-50 text-gray-500 hover:text-red-600 border border-white/60 transition-colors shadow-sm'
              title='Disconnect'
            >
              <X className='w-5 h-5' />
            </button>
          )}
        </div>
      </header>

      <div className='flex-1 overflow-y-auto space-y-6 pr-1'>
        <section className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <div className='p-5 rounded-xl border border-white/50 bg-white/70 backdrop-blur-sm shadow-sm'>
            <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
              Active Clients (tabs)
            </p>
            <h3 className='text-3xl font-bold text-[#13484f] mt-1'>
              {activeCount}
            </h3>
            <p className='text-xs text-gray-600 mt-3'>
              Unique open chatbot tabs (estimated)
            </p>
          </div>

          <div className='p-5 rounded-xl border border-white/50 bg-white/70 backdrop-blur-sm shadow-sm'>
            <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
              Active Requests
            </p>
            <h3 className='text-3xl font-bold text-[#13484f] mt-1'>
              {activeRequestsRef.current.size}
            </h3>
            <p className='text-xs text-gray-600 mt-3'>
              Concurrent requests (in-flight)
            </p>
          </div>

          <div className='p-5 rounded-xl border border-white/50 bg-white/70 backdrop-blur-sm shadow-sm'>
            <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
              Throughput (60s)
            </p>
            <h3 className='text-3xl font-bold text-[#13484f] mt-1'>
              {requestsLast60s}
            </h3>
            <p className='text-xs text-gray-600 mt-3'>
              New requests initiated in last minute
            </p>
          </div>

          <div className='p-5 rounded-xl border border-white/50 bg-white/70 backdrop-blur-sm shadow-sm'>
            <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
              Buffered Events
            </p>
            <h3 className='text-3xl font-bold text-[#13484f] mt-1'>
              {events.length}
            </h3>
            <p className='text-xs text-gray-600 mt-3'>
              Live events captured in local buffer
            </p>
          </div>
        </section>

        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            {!connected && (
              <button
                onClick={() => {
                  try {
                    wsRef.current?.close();
                  } catch {}
                  setTimeout(() => window.location.reload(), 200);
                }}
                className='px-4 py-2 rounded-xl bg-[#13484f] text-white text-sm font-medium shadow-md hover:shadow-lg transition-all active:scale-95'
              >
                Reconnect Monitor
              </button>
            )}

            <button
              onClick={clearEvents}
              className='px-4 py-2 rounded-xl bg-white/70 border border-white/50 text-gray-700 text-sm font-medium hover:bg-white/70 transition-colors flex items-center gap-2'
            >
              <Trash2 className='w-4 h-4' /> <span>Clear Log</span>
            </button>
          </div>

          <div className='text-xs font-mono text-gray-500 flex items-center gap-2 bg-white/70 px-3 py-1.5 rounded-lg border border-white/40'>
            <Clock className='w-3 h-3' /> {new Date().toLocaleTimeString()}
          </div>
        </div>

        {/* Browser breakdown */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          {Object.entries(browserCounts).map(([browser, count]) => (
            <div key={browser} className='p-4 rounded-lg border bg-white/70'>
              <div className='text-xs text-gray-500 uppercase font-semibold'>
                {browser}
              </div>
              <div className='text-2xl font-bold text-[#13484f] mt-1'>
                {count}
              </div>
              <div className='text-xs text-gray-600 mt-1'>
                Open tabs using {browser}
              </div>
            </div>
          ))}
        </div>

        <div className='rounded-xl border border-white/50 bg-white/70 backdrop-blur-md overflow-hidden shadow-sm flex flex-col min-h-[250px]'>
          <div className='px-4 py-3 border-b border-white/30 bg-white/10 flex items-center justify-between'>
            <h3 className='font-bold text-gray-700 text-sm flex items-center gap-2'>
              <Terminal className='w-4 h-4' /> Console / Log Stream
            </h3>
            <span className='text-[10px] bg-white/70 px-2 py-0.5 rounded text-gray-600 font-mono'>
              Latest First
            </span>
          </div>

          <div className='flex-1 overflow-auto p-0 max-h-[600px]'>
            {events.length === 0 ? (
              <div className='flex flex-col items-center justify-center h-40 text-gray-500'>
                <div className='mb-2 opacity-50'>
                  {connected ? (
                    <Activity className='w-8 h-8 animate-pulse' />
                  ) : (
                    <Loader2 className='w-8 h-8 animate-spin' />
                  )}
                </div>
                <p className='text-sm'>
                  {connected ? 'Waiting for events...' : 'Connecting...'}
                </p>
              </div>
            ) : (
              <div className='divide-y divide-white/20'>
                {events.map((ev, idx) => (
                  <div
                    key={idx}
                    className='p-3 flex gap-4 items-start hover:bg-white/70 transition-colors text-sm'
                  >
                    <div className='w-24 shrink-0 flex flex-col'>
                      <span className='font-mono text-xs text-gray-500'>
                        {new Date(ev.ts).toLocaleTimeString()}
                      </span>
                      <span
                        className={`text-[10px] font-bold mt-1 uppercase tracking-tighter truncate ${
                          ev.type.includes('error')
                            ? 'text-red-600'
                            : ev.type.includes('connect')
                            ? 'text-emerald-600'
                            : 'text-[#13484f]'
                        }`}
                      >
                        {ev.type.replace('monitor_', '')}
                      </span>
                    </div>

                    <div className='flex-1 min-w-0'>
                      {ev.client_id && (
                        <div className='text-[10px] font-mono text-gray-400 mb-1 bg-black/5 inline-block px-1.5 rounded'>
                          ID: {ev.client_id.slice(-6)}
                        </div>
                      )}

                      {ev.type === 'monitor_user_message' ? (
                        <div className='bg-white/70 p-2 rounded-lg border border-white/30 inline-block max-w-full'>
                          <span className='text-xs font-bold text-gray-500 block mb-0.5'>
                            User
                          </span>
                          <span className='text-gray-800 break-words'>
                            {ev.message}
                          </span>
                        </div>
                      ) : ev.type === 'monitor_reply' ? (
                        <div className='bg-[#13484f]/10 p-2 rounded-lg border border-[#13484f]/20 inline-block max-w-full'>
                          <span className='text-xs font-bold text-[#13484f] block mb-0.5'>
                            Bot Reply
                          </span>
                          <span className='text-gray-800 break-words'>
                            {ev.reply ?? ev.message}
                          </span>
                        </div>
                      ) : ev.type === 'monitor_progress' ? (
                        <div className='text-gray-600 italic flex items-center gap-2'>
                          <Loader2 className='w-3 h-3 animate-spin' />
                          {ev.message}
                        </div>
                      ) : ev.type === 'monitor_client_connect' ? (
                        <div className='text-sm'>
                          <div className='font-medium'>Client connected</div>
                          <div className='text-xs text-gray-500'>
                            {ev.user_agent
                              ? parseBrowser(ev.user_agent) +
                                ' — ' +
                                ev.user_agent
                              : 'Unknown UA'}
                          </div>
                        </div>
                      ) : ev.type === 'monitor_client_disconnect' ? (
                        <div className='text-sm'>
                          <div className='font-medium'>Client disconnected</div>
                          <div className='text-xs text-gray-500'>
                            {ev.user_agent
                              ? parseBrowser(ev.user_agent) +
                                ' — ' +
                                ev.user_agent
                              : 'Unknown UA'}
                          </div>
                        </div>
                      ) : (
                        <div className='text-gray-700 break-all font-mono text-xs'>
                          {ev.message || JSON.stringify(ev.raw)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
