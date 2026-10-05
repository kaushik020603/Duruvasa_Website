import { useState } from "react";
import { sections } from "../data/content";
import { questions, scoreQuiz, type Result } from "../lib/quiz";
import { prefillContact } from "../lib/bus";
import { navigate } from "../lib/router";

const R = 52;
const CIRC = 2 * Math.PI * R;

export default function Quiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const q = questions[step];

  const choose = (points: number) => {
    const next = { ...answers, [q.id]: points };
    setAnswers(next);
    if (step + 1 < questions.length) setStep(step + 1);
    else setResult(scoreQuiz(next));
  };
  const reset = () => { setAnswers({}); setStep(0); setResult(null); };

  const discuss = () => {
    if (!result) return;
    const head = `I took the cloud security check and scored ${result.score}/${result.max} (${result.level}).`;
    prefillContact(
      result.tips.length
        ? `${head} I would like to discuss:\n- ${result.tips.slice(0, 3).join("\n- ")}`
        : `${head} I would like to talk about keeping our security posture current.`
    );
    navigate("/#contact");
  };

  const color = result ? (result.level === "Strong" ? "#7fcb7f" : result.level === "Developing" ? "#f2c14e" : "#ff6b6b") : "#7fcb7f";

  return (
    <section id="quiz" className="quiz" aria-labelledby="quiz-h">
      <p className="eyebrow">{sections.quiz.eyebrow}</p>
      <h2 id="quiz-h">{sections.quiz.heading}</h2>
      <div className="quiz-card reveal">
        {!result ? (
          <>
            <div className="qbar" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={step}>
              <span style={{ width: `${(step / questions.length) * 100}%` }} />
            </div>
            <p className="qcount">Question {step + 1} of {questions.length}</p>
            <fieldset key={q.id}>
              <legend>{q.text}</legend>
              {q.options.map((o) => (
                <button key={o.label} type="button" className="opt" onClick={() => choose(o.points)}>{o.label}</button>
              ))}
            </fieldset>
            {step > 0 && <button type="button" className="link-btn" onClick={() => setStep(step - 1)}>← Back</button>}
          </>
        ) : (
          <div className="result" aria-live="polite">
            <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label={`Score ${result.percent} percent`}>
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - result.percent / 100)} transform="rotate(-90 60 60)"
                style={{ transition: "stroke-dashoffset 1s ease" }} />
              <text x="60" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor">{result.percent}%</text>
            </svg>
            <h3 style={{ color }}>{result.level}</h3>
            <p>You scored {result.score} out of {result.max}. This is an informal self-assessment, not a security audit.</p>
            {result.tips.length > 0 ? (
              <>
                <h4>Where to focus first</h4>
                <ul>{result.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              </>
            ) : <p>Great posture. Keep it current with regular reviews.</p>}
            <div className="result-actions">
              <button type="button" className="btn-light magnetic" onClick={discuss}>Discuss my results</button>
              <button type="button" className="link-btn" onClick={reset}>Retake</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
