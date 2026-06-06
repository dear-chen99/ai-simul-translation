import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// ═══════════════════════════════════════════════════════════════════
//  支持语言列表
// ═══════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════
//  翻译服务 — 多源备用 + 本地缓存
//  源1：MyMemory  源2：LibreTranslate  源3：Google翻译（镜像）
// ═══════════════════════════════════════════════════════════════════
const translationCache = new Map();
const MAX_CACHE_SIZE = 200;

// 带超时的 fetch
const fetchWithTimeout = (url, options = {}, timeout = 5000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('请求超时')), timeout)
    )
  ]);
};

const translateWithMyMemory = async (text, sourceLang, signal) => {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|zh`;
  const res = await fetchWithTimeout(url, { signal }, 3000);
  const data = await res.json();
  let out = data?.responseData?.translatedText || '';
  out = out.replace(/@\S+/g, '').trim();
  return out || '[翻译为空]';
};

const translateWithLibre = async (text, sourceLang, signal) => {
  const langMap = { en: 'en', ja: 'ja', fr: 'fr', de: 'de', es: 'es', ko: 'ko', ru: 'ru', it: 'it', pt: 'pt', nl: 'nl' };
  const targetLang = langMap[sourceLang] || 'en';
  const url = `https://libretranslate.de/translate`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: targetLang, target: 'zh', format: 'text' }),
    signal
  }, 3000);
  const data = await res.json();
  return data?.translatedText || '[翻译为空]';
};

// Google 翻译镜像（国内可访问）
const translateWithGoogleMirror = async (text, sourceLang, signal) => {
  // 使用国内可访问的 Google 翻译镜像
  const langMap = { en: 'en', ja: 'ja', fr: 'fr', de: 'de', es: 'es', ko: 'ko', ru: 'ru', it: 'it', pt: 'pt', nl: 'nl' };
  const sl = langMap[sourceLang] || 'auto';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=zh&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetchWithTimeout(url, { signal }, 3000);
  const data = await res.json();
  // Google 翻译返回格式: [[["译文","原文",null,null,1]],null,"源语言"]
  if (data && Array.isArray(data[0])) {
    return data[0].map(item => item[0]).join('');
  }
  return '[翻译为空]';
};

const translateText = async (text, sourceLang, signal) => {
  if (!text || !text.trim()) return '';
  const trimmed = text.trim().slice(0, 500);
  const key = `${sourceLang}:${trimmed}`;

  if (translationCache.has(key)) {
    return translationCache.get(key);
  }

  const sources = [
    () => translateWithGoogleMirror(trimmed, sourceLang, signal),
    () => translateWithMyMemory(trimmed, sourceLang, signal),
    () => translateWithLibre(trimmed, sourceLang, signal)
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result && !result.startsWith('[翻译失败') && !result.startsWith('[翻译为空')) {
        if (translationCache.size >= MAX_CACHE_SIZE) {
          const firstKey = translationCache.keys().next().value;
          translationCache.delete(firstKey);
        }
        translationCache.set(key, result);
        return result;
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn('翻译源失败:', err.message);
    }
  }

  return '[翻译失败，请检查网络]';
};

// ═══════════════════════════════════════════════════════════════════
//  TTS — 语音朗读中文
// ═══════════════════════════════════════════════════════════════════
const speakChinese = (text) => {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.92;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
};

// ═══════════════════════════════════════════════════════════════════
//  浏览器兼容性检测 — 异步探测（解决联想浏览器伪装 Chrome 的问题）
// ═══════════════════════════════════════════════════════════════════
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

    // 如果 500ms 内收到结果，说明真的支持
    rec.onresult = () => { hasResult = true; };

    rec.onerror = (e) => {
      hasError = true;
      errorType = e.error;
      // not-allowed / service-not-allowed 是权限问题，说明 API 可用但用户没给权限
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        rec.abort();
        resolve({
          supported: false,
          reason: '麦克风权限被拒绝，请允许麦克风访问',
          canUseFallback: true
        });
      }
      // network 错误在国内很常见（Google 服务被墙），不能作为"不支持"的依据
      // 让真正的语音识别去处理重试逻辑
    };

    rec.onend = () => {
      if (!hasResult && !hasError) {
        // 没有结果也没有错误，可能是正常结束（没说话），认为支持
        resolve({ supported: true, reason: '', canUseFallback: true });
      }
      if (hasError && errorType === 'network') {
        // network 错误：API 存在但连不上 Google，标记为支持（让后续重试逻辑处理）
        // 但给用户一个提示
        resolve({ supported: true, reason: '', canUseFallback: true });
      }
    };

    try { rec.start(); } catch (err) {
      resolve({ supported: false, reason: '无法启动语音识别', canUseFallback: true });
      return;
    }

    // 超时保护：2 秒内没触发致命 error，认为支持
    setTimeout(() => {
      try { rec.stop(); } catch (_) { }
      if (!hasError || errorType === 'network') {
        resolve({ supported: true, reason: '', canUseFallback: true });
      }
    }, 2000);
  });
};

// ═══════════════════════════════════════════════════════════════════
//  备用录音方案 — WebRTC + 音频分段 + 语音活动检测 (VAD)
//  适用于联想/国产浏览器（无法连接 Google Speech API）
// ═══════════════════════════════════════════════════════════════════

/*
 * 备用录音方案工具函数（预留，供后续扩展使用）
 * detectVoiceActivity: 能量阈值语音活动检测
 * float32ToWav: Float32Array 转 WAV Blob
 */
// eslint-disable-next-line no-unused-vars
const detectVoiceActivity = (audioData, threshold = 0.01) => {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += Math.abs(audioData[i]);
  }
  return (sum / audioData.length) > threshold;
};

// eslint-disable-next-line no-unused-vars
const float32ToWav = (audioData, sampleRate = 16000) => {
  const buffer = new ArrayBuffer(44 + audioData.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + audioData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, audioData.length * 2, true);
  for (let i = 0; i < audioData.length; i++) {
    const s = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

// ═══════════════════════════════════════════════════════════════════
//  演示模式数据（联想浏览器等不支持时使用）
// ═══════════════════════════════════════════════════════════════════
const DEMO_SENTENCES = [
  { en: "Welcome to the international technology conference.", zh: "欢迎来到国际技术大会。" },
  { en: "Today we will explore the future of artificial intelligence.", zh: "今天我们将探讨人工智能的未来。" },
  { en: "Machine learning has transformed every industry.", zh: "机器学习已经改变了每个行业。" },
  { en: "The latest research shows promising results in natural language processing.", zh: "最新研究在自然语言处理方面显示出令人期待的成果。" },
  { en: "We are building systems that can understand and generate human language.", zh: "我们正在构建能够理解和生成人类语言的系统。" },
  { en: "Thank you for your attention, any questions?", zh: "谢谢您的关注，有什么问题吗？" },
];

// ═══════════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  /* ── state ───────────────────────────────────────────────── */
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [prevTranslation, setPrevTranslation] = useState('');  // 上一次翻译（修正对比）
  const [history, setHistory] = useState([]);
  const [volume, setVolume] = useState(0);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [status, setStatus] = useState('空闲');
  const [statusType, setStatusType] = useState('idle'); // idle|listening|translating|error|retrying
  const [langIndex, setLangIndex] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);  // 自动修正次数统计
  const [browserInfo, setBrowserInfo] = useState({ supported: true, reason: '', canUseFallback: true });
  const [isDemoMode, setIsDemoMode] = useState(false); // 演示模式
  const [isFallbackMode, setIsFallbackMode] = useState(false); // 备用录音模式
  const demoTimerRef = useRef(null);
  const demoIndexRef = useRef(0);

  /* ── refs (闭包安全 & 副作用控制) ──────────────────────── */
  const isListeningRef = useRef(false);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const abortCtrlRef = useRef(null);
  const debounceRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const lastErrorRef = useRef(null);
  const langIndexRef = useRef(0);
  const pendingFinalRef = useRef('');  // 等待翻译的 final 文本（用于历史修正）
  const historyIdRef = useRef(null); // 当前正在修正的历史条目 id
  const finalTranscriptRef = useRef(''); // 用于 stopListening 时读取最终文本
  const translatedTextRef = useRef('');  // 新增：用于 stopListening 闭包安全

  /* ── 备用录音模式 refs ─────────────────────────────────── */
  const fallbackRecorderRef = useRef(null); // MediaRecorder 实例
  const fallbackChunksRef = useRef([]);   // 音频数据块
  const fallbackIntervalRef = useRef(null); // 定时录制间隔

  /* ── 同步 langIndex → ref ───────────────────────────────── */
  useEffect(() => { langIndexRef.current = langIndex; }, [langIndex]);

  /* ── 同步 translatedText → ref ──────────────────────────── */
  useEffect(() => { translatedTextRef.current = translatedText; }, [translatedText]);

  /* ── 启动时异步探测浏览器兼容性 ─────────────────────────── */
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

  /* ── 演示模式逻辑 ────────────────────────────────────────── */
  const startDemoMode = useCallback(() => {
    setIsDemoMode(true);
    setIsListening(true);
    isListeningRef.current = true;
    setStatus('演示模式运行中...');
    setStatusType('listening');
    demoIndexRef.current = 0;

    const runDemo = () => {
      if (!isListeningRef.current) return;
      const idx = demoIndexRef.current % DEMO_SENTENCES.length;
      const sentence = DEMO_SENTENCES[idx];

      // 先显示 interim（模拟识别中）
      setInterimTranscript(sentence.en);
      setTranslatedText('识别中...');
      setStatusType('translating');

      setTimeout(() => {
        if (!isListeningRef.current) return;
        // 转为 final
        setFinalTranscript(prev => (prev + ' ' + sentence.en).trim());
        setInterimTranscript('');
        setTranslatedText(sentence.zh);
        setStatusType('listening');
        setStatus('演示模式运行中...');

        const now = new Date().toLocaleTimeString();
        setHistory(prev => [
          { id: Date.now(), original: sentence.en, translation: sentence.zh, time: now, corrected: false },
          ...prev.slice(0, 39),
        ]);
        if (speakEnabled) speakChinese(sentence.zh);

        demoIndexRef.current++;
        demoTimerRef.current = setTimeout(runDemo, 4000);
      }, 1500);
    };

    demoTimerRef.current = setTimeout(runDemo, 800);
  }, [speakEnabled]);

  const stopDemoMode = useCallback(() => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    setIsDemoMode(false);
    setIsListening(false);
    isListeningRef.current = false;
    setStatus('已停止');
    setStatusType('idle');
    setInterimTranscript('');
    setVolume(0);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     音量可视化
  ═══════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════
     备用录音模式 — WebRTC 音频录制 + 分段处理
     适用于无法使用 Web Speech API 的浏览器
  ═══════════════════════════════════════════════════════════ */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startFallbackMode = useCallback(async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      mediaStreamRef.current = stream;
    } catch (err) {
      alert('无法获取麦克风权限，请检查浏览器或系统设置');
      return;
    }

    // 重置状态
    setFinalTranscript('');
    setInterimTranscript('');
    setTranslatedText('');
    setPrevTranslation('');
    setCorrectionCount(0);
    isListeningRef.current = true;
    setIsListening(true);
    setIsFallbackMode(true);
    setStatus('备用录音模式运行中...');
    setStatusType('listening');

    // 设置音量可视化
    await setupVolumeMeter(stream);

    // 使用 MediaRecorder 录制音频
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

    if (!mimeType) {
      alert('当前浏览器不支持音频录制');
      stopFallbackMode();
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    fallbackRecorderRef.current = recorder;
    fallbackChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        fallbackChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      // 可以在这里处理录制的音频数据
      fallbackChunksRef.current = [];
    };

    // 每 3 秒分段录制，模拟实时效果
    recorder.start(3000);

    // 定时模拟 interim 文本（实际使用时这里应该调用语音识别 API）
    let segmentCount = 0;
    fallbackIntervalRef.current = setInterval(() => {
      if (!isListeningRef.current) return;
      segmentCount++;

      // 模拟识别中的状态
      setInterimTranscript(`[录音分段 ${segmentCount}] 正在处理音频...`);
      setStatus('识别中...');
      setStatusType('translating');

      // 2 秒后模拟识别结果
      setTimeout(() => {
        if (!isListeningRef.current) return;
        const mockText = `[录音片段 ${segmentCount}] 备用模式暂不支持实时语音识别，建议使用 Chrome/Edge 浏览器获得完整体验`;
        setFinalTranscript(prev => (prev + ' ' + mockText).slice(-3000));
        setInterimTranscript('');
        setTranslatedText('备用录音模式：音频已录制，请使用兼容浏览器获得实时翻译');
        setStatus('备用录音模式运行中...');
        setStatusType('listening');

        const now = new Date().toLocaleTimeString();
        setHistory(prev => [
          { id: Date.now(), original: mockText, translation: '备用模式提示', time: now, corrected: false },
          ...prev.slice(0, 39),
        ]);
      }, 1500);
    }, 5000);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupVolumeMeter]);

  const stopFallbackMode = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setIsFallbackMode(false);

    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
      try { fallbackRecorderRef.current.stop(); } catch (_) { }
      fallbackRecorderRef.current = null;
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
    setInterimTranscript('');
  }, []);

  /* ═══════════════════════════════════════════════════════════
     翻译触发：final 文本确定后才翻译，interim 只显示不翻译
     历史记录：只在停止传译时写入一次，避免长篇内容产生大量记录
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    // interim 文本变化时，只显示原文，不触发翻译
    if (interimTranscript && !finalTranscript) {
      setTranslatedText('识别中...');
      return;
    }

    const fullText = finalTranscript.trim();
    if (!fullText) {
      setTranslatedText('');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortCtrlRef.current) abortCtrlRef.current.abort();

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      setStatus('翻译中...');
      setStatusType('translating');

      const lang = LANGUAGES[langIndexRef.current];
      const result = await translateText(fullText, lang.apiLang, ctrl.signal);

      if (result === null) return; // 被 abort，说明有更新的翻译请求

      // ★ 自动修正：如果翻译结果与上一次不同，记录修正
      if (result && result !== prevTranslation && prevTranslation) {
        setCorrectionCount(c => c + 1);
      }
      setPrevTranslation(result || '');
      setTranslatedText(result || '');

      if (isListeningRef.current) {
        setStatus('聆听中...');
        setStatusType('listening');
      }

      // 运行中不写入历史，避免长篇内容产生大量记录
      // 历史记录在 stopListening 中统一写入
      if (speakEnabled && result) speakChinese(result);
    }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTranscript, interimTranscript, speakEnabled]);

  /* ═══════════════════════════════════════════════════════════
     初始化语音识别实例
  ═══════════════════════════════════════════════════════════ */
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

    /* onstart：重置重试计数 */
    rec.onstart = () => {
      retryCountRef.current = 0;
      lastErrorRef.current = null;
      setStatus('聆听中...');
      setStatusType('listening');
    };

    /* onerror：记录错误，不主动重启（交由 onend 统一处理） */
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

    /* onend：自动重启保持连续监听 */
    rec.onend = () => {
      if (!isListeningRef.current) {
        setStatus('已停止');
        setStatusType('idle');
        return;
      }

      // 清除之前的重试定时器
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

      // 如果没有错误（正常结束，例如用户停顿）
      if (!lastErrorRef.current) {
        // 正常停顿后的重启延迟：1.5 秒，避免频繁创建实例
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

      // 有错误时的处理
      let delay = 300;
      if (lastErrorRef.current === 'network') {
        retryCountRef.current = Math.min(retryCountRef.current + 1, 3);
        if (retryCountRef.current >= 3) {
          setStatus('网络错误，无法连接语音识别服务');
          setStatusType('error');
          stopListening();
          setTimeout(() => {
            const useFallback = window.confirm(
              '⚠️ 连续网络错误，无法连接到 Google 语音识别服务。\n\n' +
              '是否切换到「备用录音模式」？'
            );
            if (useFallback) startFallbackMode();
          }, 500);
          return;
        }
        delay = Math.min(1000 * (2 ** (retryCountRef.current - 1)), 8000);
        const secs = Math.round(delay / 1000);
        setStatus(`网络错误，${secs}s 后重试 (${retryCountRef.current}/3)`);
        setStatusType('retrying');
      } else if (lastErrorRef.current === 'no-speech') {
        // 无语音输入时，等待 1 秒后重启
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

    /* onresult：分流 interim / final */
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
          pendingFinalRef.current = next.trim();
          finalTranscriptRef.current = next.trim();
          return next;
        });
      }
      setInterimTranscript(interim);
    };

    return rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ═══════════════════════════════════════════════════════════
     开始监听
  ═══════════════════════════════════════════════════════════ */
  const startListening = async () => {
    // 检测浏览器是否支持
    if (!browserInfo.supported) {
      if (browserInfo.canUseFallback) {
        // 有备用方案，启动备用录音模式
        const useFallback = window.confirm(
          `⚠️ ${browserInfo.reason}\n\n` +
          `是否启动「备用录音模式」？\n` +
          `该模式可录制音频并显示音量，但暂不支持实时语音识别。\n\n` +
          `点「确定」= 备用录音模式，点「取消」= 演示模式`
        );
        if (useFallback) {
          startFallbackMode();
        } else {
          startDemoMode();
        }
      } else {
        // 完全不支持，只能演示模式
        const useDemo = window.confirm(
          `⚠️ ${browserInfo.reason}\n\n` +
          `是否启动「演示模式」体验功能演示？\n` +
          `（点确定 = 演示模式，点取消 = 返回）`
        );
        if (useDemo) startDemoMode();
      }
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

    // 重置所有状态
    setFinalTranscript('');
    setInterimTranscript('');
    setTranslatedText('');
    setPrevTranslation('');
    setCorrectionCount(0);
    retryCountRef.current = 0;
    lastErrorRef.current = null;
    historyIdRef.current = null;
    finalTranscriptRef.current = '';

    isListeningRef.current = true;
    setIsListening(true);

    const rec = initRecognition(langIndex);
    if (!rec) { isListeningRef.current = false; setIsListening(false); return; }
    recognitionRef.current = rec;
    rec.start();

    await setupVolumeMeter(stream);
  };

  /* ═══════════════════════════════════════════════════════════
     停止监听
  ═══════════════════════════════════════════════════════════ */
  const stopListening = useCallback(() => {
    if (isDemoMode) {
      stopDemoMode();
      return;
    }
    if (isFallbackMode) {
      stopFallbackMode();
      return;
    }
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortCtrlRef.current) abortCtrlRef.current.abort();

    setVolume(0);
    setStatus('已停止');
    setStatusType('idle');
    window.speechSynthesis?.cancel();

    // 停止时把当前内容写入历史（整段只写一次）
    const finalText = finalTranscriptRef.current?.trim() || finalTranscript.trim();
    const translated = translatedTextRef.current.trim();  // ★ 用 ref 读最新值
    if (finalText && translated && translated !== '识别中...') {
      const now = new Date().toLocaleTimeString();
      setHistory(prev => {
        const newId = Date.now();
        return [
          { id: newId, original: finalText, translation: translated, time: now, corrected: false },
          ...prev.slice(0, 39),
        ];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, stopDemoMode, isFallbackMode, stopFallbackMode]);  // ★ 移除 finalTranscript, translatedText

  // 组件卸载时直接清理，不依赖 stopListening（避免闭包陷阱）
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortCtrlRef.current) abortCtrlRef.current.abort();
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
      if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
        try { fallbackRecorderRef.current.stop(); } catch (_) { }
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════
     切换语言（监听中立即生效）
  ═══════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════
     手动修正译文
  ═══════════════════════════════════════════════════════════ */
  const handleManualEdit = () => {
    const edited = window.prompt('手动修正译文：', translatedText);
    if (edited && edited.trim()) {
      setTranslatedText(edited.trim());
      if (speakEnabled) speakChinese(edited.trim());
    }
  };

  /* ═══════════════════════════════════════════════════════════
     渲染
  ═══════════════════════════════════════════════════════════ */
  const lang = LANGUAGES[langIndex];

  return (
    <div className="app-root">
      {/* ── 背景光晕 ── */}
      <div className="bg-glow glow-1" />
      <div className="bg-glow glow-2" />

      <div className="glass-shell">

        {/* ══ 浏览器不兼容提示横幅 ══ */}
        {!browserInfo.supported && (
          <div className="browser-warning">
            <span className="bw-icon">⚠️</span>
            <div className="bw-content">
              <strong>当前浏览器不支持实时语音识别</strong>
              <span className="bw-desc">
                {browserInfo.reason}。建议使用 <strong>Google Chrome</strong> 或 <strong>Microsoft Edge</strong> 浏览器打开此页面，才能使用完整功能。
              </span>
            </div>
            <div className="bw-actions">
              {browserInfo.canUseFallback && (
                <button
                  className="bw-fallback-btn"
                  onClick={isListening ? stopListening : startFallbackMode}
                >
                  {isListening && isFallbackMode ? '⏹ 停止录音' : '🎙️ 备用录音模式'}
                </button>
              )}
              <button className="bw-demo-btn" onClick={isListening ? stopListening : startDemoMode}>
                {isListening && isDemoMode ? '⏹ 停止演示' : '▶ 演示模式'}
              </button>
            </div>
          </div>
        )}

        {/* ══ 演示模式标识 ══ */}
        {isDemoMode && (
          <div className="demo-banner">
            🎬 演示模式 — 模拟实时外语识别与翻译效果（非真实麦克风输入）
          </div>
        )}

        {/* ══ 备用录音模式标识 ══ */}
        {isFallbackMode && (
          <div className="fallback-banner">
            🎙️ 备用录音模式 — 正在录制音频（暂不支持实时语音识别，建议使用 Chrome/Edge 获得完整体验）
          </div>
        )}
        <header className="app-header">
          <div className="logo-row">
            <span className="logo-icon">🎧</span>
            <div>
              <h1 className="app-title">AI 同声传译助手</h1>
              <p className="app-desc">外语演讲 · 技术分享 · 国际会议 · 网课 → 实时中文字幕 + 语音</p>
            </div>
            {correctionCount > 0 && (
              <div className="correction-badge">
                <span>✨ 已修正 {correctionCount} 次</span>
              </div>
            )}
          </div>
        </header>

        {/* ══ 控制栏 ══ */}
        <section className="control-bar">
          {/* 开始/停止 */}
          <button
            className={`main-btn ${isListening ? 'main-btn--stop' : 'main-btn--start'}`}
            onClick={isListening ? stopListening : startListening}
          >
            <span className={`btn-dot ${isListening ? 'dot-pulse' : ''}`} />
            {isListening
              ? (isDemoMode ? '停止演示' : isFallbackMode ? '停止录音' : '停止传译')
              : (browserInfo.supported ? '开始同声传译' : '备用录音 / 演示')}
          </button>

          {/* 语言选择 */}
          <label className="lang-wrap">
            <span className="lang-label">识别语言</span>
            <select className="lang-select" value={langIndex} onChange={handleLangChange}>
              {LANGUAGES.map((l, i) => (
                <option key={l.srLang} value={i}>{l.label}</option>
              ))}
            </select>
          </label>

          {/* 状态 + 音量 */}
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

          {/* 语音播报开关 */}
          <label className="toggle-wrap">
            <input
              type="checkbox"
              checked={speakEnabled}
              onChange={() => {
                setSpeakEnabled(v => !v);
                if (speakEnabled) window.speechSynthesis?.cancel();
              }}
            />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">🔊 语音播报</span>
          </label>

          {/* 清空 */}
          <button className="clear-btn" onClick={() => { setHistory([]); setCorrectionCount(0); }}>
            🗑️ 清空
          </button>
        </section>

        {/* ══ 字幕主区 ══ */}
        <section className="subtitle-grid">
          {/* 原文 */}
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

          {/* 译文 */}
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
                  {isListening
                    ? <><span className="trans-spinner">⟳</span> 识别后自动翻译...</>
                    : '翻译结果将显示在这里'}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ══ 历史修正面板 ══ */}
        <section className="history-panel">
          <div className="history-head">
            <span className="panel-tag">📋 翻译历史 &amp; 自动纠错日志</span>
            <span className="history-count">{history.length} 条记录</span>
          </div>
          <div className="history-list">
            {history.length === 0 ? (
              <div className="history-empty">
                <p>🔍 暂无记录</p>
                <p>启动后，每次识别结果将在此记录；若 AI 自动修正了识别或翻译，该条目会标记 ✨</p>
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

        {/* ══ 底部提示 ══ */}
        <footer className="app-footer">
          <p>
            💡 <strong>使用方式：</strong>选择语言 → 开始传译 → 将麦克风对准外语扬声器或直接朗读。
            &nbsp;✨ <strong>自动修正：</strong>识别结果持续更新，翻译随之实时修正，确保准确性。
          </p>
          <p className="footer-note">
            {browserInfo.supported
              ? '支持 Chrome / Edge · Web Speech API + MyMemory 翻译'
              : '联想/国产浏览器已启用备用录音模式 · 建议切换 Chrome/Edge 获得完整体验'}
          </p>
        </footer>

      </div>
    </div>
  );
}
