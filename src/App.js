import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const LANGUAGES = [
  { label: '🇺🇸 英语', srLang: 'en-US', apiLang: 'en', flag: '🇺🇸' },
  { label: '🇯🇵 日语', srLang: 'ja-JP', apiLang: 'ja', flag: '🇯🇵' },
  { label: '🇫🇷 法语', srLang: 'fr-FR', apiLang: 'fr', flag: '🇫🇷' },
  { label: '🇩🇪 德语', srLang: 'de-DE', apiLang: 'de', flag: '🇩🇪' },
  { label: '🇪🇸 西班牙语', srLang: 'es-ES', apiLang: 'es', flag: '🇪🇸' },
  { label: '🇰🇷 韩语', srLang: 'ko-KR', apiLang: 'ko', flag: '🇰🇷' },
  { label: '🇷🇺 俄语', srLang: 'ru-RU', apiLang: 'ru', flag: '🇷🇺' },
  { label: '🇮🇹 意大利语', srLang: 'it-IT', apiLang: 'it', flag: '🇮🇹' },
  { label: '🇵🇹 葡萄牙语', srLang: 'pt-PT', apiLang: 'pt', flag: '🇵🇹' },
  { label: '🇳🇱 荷兰语', srLang: 'nl-NL', apiLang: 'nl', flag: '🇳🇱' },
];

// 浏览器兼容性检测函数
const probeSpeechRecognition = () => {
  return new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      resolve({ supported: false, reason: '您的浏览器不支持 Web Speech API', canUseFallback: true });
      return;
    }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    let hasResult = false;
    let hasError = false;
    let errorType = null;

    rec.onresult = () => { hasResult = true; };

    rec.onerror = (e) => {
      hasError = true;
      errorType = e.error;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        rec.abort();
        resolve({
          supported: false,
          reason: '麦克风权限被拒绝，请允许麦克风访问',
          canUseFallback: true
        });
      }
    };

    rec.onend = () => {
      if (!hasResult && !hasError) {
        resolve({ supported: true, reason: '', canUseFallback: true });
      }
      if (hasError && errorType === 'network') {
        resolve({ supported: true, reason: '', canUseFallback: true });
      }
    };

    try {
      rec.start();
    } catch (err) {
      resolve({ supported: false, reason: '无法启动语音识别', canUseFallback: true });
      return;
    }

    setTimeout(() => {
      try { rec.stop(); } catch (_) { }
      if (!hasError || errorType === 'network') {
        resolve({ supported: true, reason: '', canUseFallback: true });
      }
    }, 2000);
  });
};

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [history, setHistory] = useState([]);
  const [volume, setVolume] = useState(0);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [status, setStatus] = useState('空闲');
  const [statusType, setStatusType] = useState('idle');
  const [langIndex, setLangIndex] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [browserInfo, setBrowserInfo] = useState({ supported: true, reason: '', canUseFallback: true });

  const isListeningRef = useRef(false);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const lastErrorRef = useRef(null);
  const langIndexRef = useRef(0);
  const finalTranscriptRef = useRef('');

  useEffect(() => {
    langIndexRef.current = langIndex;
  }, [langIndex]);

  // 启动时检测浏览器兼容性
  useEffect(() => {
    let cancelled = false;
    setStatus('检测浏览器兼容性...');
    setStatusType('translating');

    probeSpeechRecognition().then(info => {
      if (cancelled) return;
      setBrowserInfo(info);
      setStatus('空闲');
      setStatusType('idle');
    });

    return () => { cancelled = true; };
  }, []);

  const initRecognition = useCallback((langIdx) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('您的浏览器不支持 Web Speech API，请使用 Chrome 或 Edge 浏览器');
      return null;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANGUAGES[langIdx].srLang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      retryCountRef.current = 0;
      lastErrorRef.current = null;
      setStatus('聆听中...');
      setStatusType('listening');
    };

    rec.onerror = (e) => {
      lastErrorRef.current = e.error;
      console.warn('[SR] error:', e.error);
      switch (e.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          alert('麦克风权限被拒绝，请在浏览器地址栏点击锁图标允许麦克风访问后重试');
          stopListening();
          break;
        case 'audio-capture':
          setStatus('麦克风不可用');
          setStatusType('error');
          stopListening();
          break;
        case 'network':
          setStatus('网络连接失败，重试中...');
          setStatusType('retrying');
          break;
        case 'no-speech':
          setStatus('等待语音...');
          setStatusType('listening');
          break;
        default:
          setStatus(`识别错误: ${e.error}`);
          setStatusType('error');
      }
    };

    rec.onend = () => {
      if (!isListeningRef.current) {
        setStatus('已停止');
        setStatusType('idle');
        return;
      }

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

      if (!lastErrorRef.current) {
        retryTimerRef.current = setTimeout(() => {
          if (!isListeningRef.current) return;
          try {
            const newRec = initRecognition(langIndexRef.current);
            if (newRec) {
              recognitionRef.current = newRec;
              newRec.start();
            }
          } catch (err) {
            console.warn('[SR] restart failed:', err);
          }
        }, 1500);
        return;
      }

      let delay = 300;
      if (lastErrorRef.current === 'network') {
        retryCountRef.current = Math.min(retryCountRef.current + 1, 3);
        if (retryCountRef.current >= 3) {
          setStatus('网络错误，无法连接语音识别服务');
          setStatusType('error');
          stopListening();
          return;
        }
        delay = Math.min(1000 * (2 ** (retryCountRef.current - 1)), 8000);
        const secs = Math.round(delay / 1000);
        setStatus(`网络错误，${secs}s 后重试 (${retryCountRef.current}/3)`);
        setStatusType('retrying');
      } else if (lastErrorRef.current === 'no-speech') {
        delay = 1000;
        setStatus('等待语音...');
        setStatusType('listening');
      }

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (!isListeningRef.current) return;
        try {
          const newRec = initRecognition(langIndexRef.current);
          if (newRec) {
            recognitionRef.current = newRec;
            newRec.start();
          }
        } catch (err) {
          console.warn('[SR] restart failed:', err);
        }
      }, delay);
    };

    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += t + ' ';
        } else {
          interim += t;
        }
      }
      if (final) {
        setFinalTranscript(prev => {
          const next = (prev + final).slice(-3000);
          finalTranscriptRef.current = next.trim();
          return next;
        });
      }
      setInterimTranscript(interim);
    };

    return rec;
  }, []);

  const setupVolumeMeter = useCallback(async (stream) => {
    if (audioContextRef.current) {
      try { await audioContextRef.current.close(); } catch (_) { }
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    if (ctx.state === 'suspended') await ctx.resume();

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!isListeningRef.current) { setVolume(0); return; }
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s, v) => s + v, 0) / (buf.length || 1);
      setVolume(Math.min(1, avg / 100));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const startListening = async () => {
    if (!browserInfo.supported) {
      alert(`⚠️ ${browserInfo.reason}`);
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
    } catch (err) {
      alert('无法获取麦克风权限，请检查浏览器或系统设置');
      return;
    }

    setFinalTranscript('');
    setInterimTranscript('');
    setTranslatedText('');
    setCorrectionCount(0);
    retryCountRef.current = 0;
    lastErrorRef.current = null;
    finalTranscriptRef.current = '';

    isListeningRef.current = true;
    setIsListening(true);

    const rec = initRecognition(langIndex);
    if (!rec) { isListeningRef.current = false; setIsListening(false); return; }
    recognitionRef.current = rec;
    rec.start();

    await setupVolumeMeter(stream);
  };

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) { }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    setVolume(0);
    setStatus('已停止');
    setStatusType('idle');
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) { }
        recognitionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => { });
        audioContextRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleLangChange = (e) => {
    const idx = Number(e.target.value);
    setLangIndex(idx);
    if (isListeningRef.current && recognitionRef.current) {
      retryCountRef.current = 0;
      lastErrorRef.current = null;
      try { recognitionRef.current.stop(); } catch (_) { }
      setTimeout(() => {
        if (!isListeningRef.current) return;
        const r = initRecognition(idx);
        if (r) { recognitionRef.current = r; r.start(); }
      }, 200);
    }
  };

  const handleManualEdit = () => {
    const edited = window.prompt('手动修正译文：', translatedText);
    if (edited && edited.trim()) {
      setTranslatedText(edited.trim());
    }
  };

  const clearHistory = () => {
    setHistory([]);
    setCorrectionCount(0);
  };

  const lang = LANGUAGES[langIndex];

  return (
    <div className="app-root">
      <div className="bg-glow glow-1" />
      <div className="bg-glow glow-2" />

      <div className="glass-shell">
        {!browserInfo.supported && (
          <div className="browser-warning">
            <span className="bw-icon">⚠️</span>
            <div className="bw-content">
              <strong>当前浏览器不支持实时语音识别</strong>
              <span className="bw-desc">
                {browserInfo.reason}。建议使用 <strong>Google Chrome</strong> 或 <strong>Microsoft Edge</strong> 浏览器打开此页面。
              </span>
            </div>
          </div>
        )}

        <header className="app-header">
          <div className="logo-row">
            <span className="logo-icon">🎧</span>
            <div>
              <h1 className="app-title">AI 同声传译助手</h1>
              <p className="app-desc">外语演讲 · 技术分享 · 国际会议 · 网课 → 实时中文字幕 + 语音</p>
            </div>
          </div>
        </header>

        <section className="control-bar">
          <button
            className={`main-btn ${isListening ? 'main-btn--stop' : 'main-btn--start'}`}
            onClick={isListening ? stopListening : startListening}
          >
            <span className={`btn-dot ${isListening ? 'dot-pulse' : ''}`} />
            {isListening ? '停止传译' : '开始同声传译'}
          </button>

          <label className="lang-wrap">
            <span className="lang-label">识别语言</span>
            <select className="lang-select" value={langIndex} onChange={handleLangChange}>
              {LANGUAGES.map((l, i) => (
                <option key={l.srLang} value={i}>{l.label}</option>
              ))}
            </select>
          </label>

          <div className="status-wrap">
            <span className={`status-dot status-${statusType}`} />
            <span className="status-text">{status}</span>
            <div className="vol-bar-track">
              <div
                className="vol-bar-fill"
                style={{ width: `${volume * 100}%`, opacity: isListening ? 1 : 0.3 }}
              />
            </div>
            <span className="vol-icon">🎤</span>
          </div>

          <label className="toggle-wrap">
            <input
              type="checkbox"
              checked={speakEnabled}
              onChange={() => setSpeakEnabled(v => !v)}
            />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">🔊 语音播报（功能待添加）</span>
          </label>

          <button className="clear-btn" onClick={clearHistory}>
            🗑️ 清空
          </button>
        </section>

        <section className="subtitle-grid">
          <div className="subtitle-panel panel-source">
            <div className="panel-head">
              <span className="panel-tag">{lang.flag} 原文</span>
              <span className="panel-lang">{lang.label}</span>
            </div>
            <div className="panel-body source-text">
              {finalTranscript && <span className="final-text">{finalTranscript}</span>}
              {interimTranscript && <span className="interim-text"> {interimTranscript}</span>}
              {!finalTranscript && !interimTranscript && (
                <span className="placeholder-text">
                  {isListening ? '🎙️ 等待语音输入...' : '点击「开始同声传译」启动'}
                </span>
              )}
            </div>
          </div>

          <div className="subtitle-panel panel-target">
            <div className="panel-head">
              <span className="panel-tag">🇨🇳 译文</span>
              <span className="panel-lang">中文 · 实时同传</span>
              {translatedText && (
                <button className="edit-btn" onClick={handleManualEdit}>✏️ 修正</button>
              )}
            </div>
            <div className="panel-body target-text">
              {translatedText || (
                <span className="placeholder-text">
                  {isListening ? <><span className="trans-spinner">⟳</span> 翻译功能待添加...</> : '翻译结果将显示在这里'}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="history-panel">
          <div className="history-head">
            <span className="panel-tag">📋 翻译历史 &amp; 自动纠错日志</span>
            <span className="history-count">{history.length} 条记录</span>
          </div>
          <div className="history-list">
            {history.length === 0 ? (
              <div className="history-empty">
                <p>🔍 暂无记录</p>
                <p>启动后，每次识别结果将在此记录</p>
              </div>
            ) : (
              history.map(item => (
                <div key={item.id} className={`history-item ${item.corrected ? 'item-corrected' : ''}`}>
                  <div className="hi-meta">
                    <span className="hi-time">{item.time}</span>
                    {item.corrected && <span className="hi-badge">✨ 已修正</span>}
                  </div>
                  <div className="hi-original">🔊 {item.original}</div>
                  <div className="hi-translation">📖 {item.translation}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className="app-footer">
          <p>💡 <strong>使用方式：</strong>选择语言 → 开始传译 → 将麦克风对准外语扬声器或直接朗读。</p>
          <p className="footer-note">支持 Chrome / Edge · Web Speech API 语音识别</p>
        </footer>
      </div>
    </div>
  );
}