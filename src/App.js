import React, { useState } from 'react';
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

  const handleLangChange = (e) => {
    setLangIndex(Number(e.target.value));
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

  return (
    <div className="app-root">
      <div className="bg-glow glow-1" />
      <div className="bg-glow glow-2" />

      <div className="glass-shell">
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

        <section className="control-bar">
          <button
            className={`main-btn ${isListening ? 'main-btn--stop' : 'main-btn--start'}`}
            onClick={() => setIsListening(!isListening)}
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
            <span className="toggle-label">🔊 语音播报</span>
          </label>

          <button className="clear-btn" onClick={clearHistory}>
            🗑️ 清空
          </button>
        </section>

        <section className="subtitle-grid">
          <div className="subtitle-panel panel-source">
            <div className="panel-head">
              <span className="panel-tag">{LANGUAGES[langIndex].flag} 原文</span>
              <span className="panel-lang">{LANGUAGES[langIndex].label}</span>
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
                  {isListening ? <><span className="trans-spinner">⟳</span> 识别后自动翻译...</> : '翻译结果将显示在这里'}
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
          <p className="footer-note">支持 Chrome / Edge · Web Speech API + MyMemory 翻译</p>
        </footer>
      </div>
    </div>
  );
}