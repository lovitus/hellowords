"use client";

import { useEffect, useRef, useState } from "react";
import { SCENE_CONVERSATIONS } from "../domain/sceneConversations";

const MEDICAL_CONVERSATION_SCENE_IDS = new Set([
  "hospital",
  "hospital-inpatient-bedspace",
  "hospital-pharmacy",
  "emergency-department",
  "intensive-care-unit",
  "operating-theatre",
  "radiology-suite",
  "pathology-lab",
]);

export function SceneConversation({ sceneId, disabled, onOpenChange }: {
  sceneId: string;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const conversations = SCENE_CONVERSATIONS[sceneId];
  const dialog = useRef<HTMLDialogElement>(null);
  const [hideTranslation, setHideTranslation] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const speaking = useRef(false);
  useEffect(() => {
    return () => {
      if (speaking.current) window.speechSynthesis?.cancel();
      onOpenChange(false);
    };
  }, [onOpenChange]);
  if (!conversations) return null;

  function stopSpeech() {
    if (speaking.current) window.speechSynthesis?.cancel();
    speaking.current = false;
  }

  return <>
    <button type="button" className="scene-conversation-toggle" disabled={disabled}
      onClick={() => {
        setSpeechAvailable("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
        setSpeechError("");
        dialog.current?.showModal();
        onOpenChange(true);
      }}>
      情景会话
    </button>
    <dialog ref={dialog} className="scene-conversation" aria-labelledby="scene-conversation-title"
      onClose={() => { stopSpeech(); onOpenChange(false); }}>
      <header>
        <h2 id="scene-conversation-title">在这里怎么说</h2>
        <button type="button" aria-label="关闭情景会话" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <label className="scene-conversation-practice">
        <input type="checkbox" checked={hideTranslation} onChange={event => setHideTranslation(event.target.checked)} />
        遮住中文，练习表达
      </label>
      <div className="scene-conversation-grid">
        {conversations.map(conversation => <section key={conversation.title}>
          <h3>{conversation.title}</h3>
          <ol>{conversation.lines.map(([english, chinese], index) => <li key={english}>
            <span className="scene-conversation-role">{conversation.roles[index % 2]}</span>
            <div><p lang="en">{english}</p>
              {!hideTranslation ? <p lang="zh-CN" className="scene-conversation-translation">{chinese}</p> : null}
            </div>
            <button type="button" disabled={!speechAvailable} aria-label={`听读：${english}`}
              onClick={() => {
                stopSpeech();
                setSpeechError("");
                try {
                  const utterance = new SpeechSynthesisUtterance(english);
                  utterance.lang = "en-US";
                  utterance.rate = 0.88;
                  utterance.onerror = event => {
                    if (event.error !== "canceled" && event.error !== "interrupted") setSpeechError("语音暂不可用，可以继续阅读和练习。");
                  };
                  speaking.current = true;
                  window.speechSynthesis.speak(utterance);
                } catch { setSpeechError("语音暂不可用，可以继续阅读和练习。"); }
              }}>听</button>
          </li>)}</ol>
        </section>)}
      </div>
      <p className="scene-conversation-note" role="status">{speechError || (!speechAvailable ? "当前浏览器不支持听读。" : "听读使用设备合成语音。关闭后回到原来的探索位置。")}</p>
      {MEDICAL_CONVERSATION_SCENE_IDS.has(sceneId)
        ? <p className="scene-conversation-note">仅用于语言练习，不提供诊断或用药建议。</p>
        : null}
    </dialog>
  </>;
}
