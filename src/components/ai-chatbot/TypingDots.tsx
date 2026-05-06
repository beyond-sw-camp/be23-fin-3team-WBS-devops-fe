/**
 * 응답 대기 중 "..." 3점이 튀는 로딩 표시.
 * CSS keyframes 로 구현, 의존성 없음.
 */
export default function TypingDots() {
  return (
    <>
      <style>{`
        @keyframes chatbot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .chatbot-typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #8c8c8c;
          margin-right: 4px;
          animation: chatbot-bounce 1.2s infinite ease-in-out;
        }
        .chatbot-typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .chatbot-typing-dot:nth-child(3) { animation-delay: 0.3s; margin-right: 0; }
      `}</style>
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 0' }}>
        <span className="chatbot-typing-dot" />
        <span className="chatbot-typing-dot" />
        <span className="chatbot-typing-dot" />
      </span>
    </>
  );
}
