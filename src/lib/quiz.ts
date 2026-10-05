export interface Question {
  id: string;
  text: string;
  options: { label: string; points: number }[];
  /** Shown when the answer scores below full marks. */
  tip: string;
}

export const questions: Question[] = [
  {
    id: "mfa", text: "Is multi-factor authentication required for all users and admins?",
    options: [{ label: "Yes, everywhere", points: 2 }, { label: "Only for some", points: 1 }, { label: "No / not sure", points: 0 }],
    tip: "Enforce MFA for every user and admin account first. It blocks most credential-based attacks.",
  },
  {
    id: "monitor", text: "Is your cloud monitored for suspicious activity around the clock?",
    options: [{ label: "Yes, 24/7", points: 2 }, { label: "Business hours only", points: 1 }, { label: "No", points: 0 }],
    tip: "Add continuous monitoring so risky behavior is flagged outside business hours too.",
  },
  {
    id: "backup", text: "Are backups encrypted, isolated and restore-tested?",
    options: [{ label: "Yes, tested regularly", points: 2 }, { label: "We back up but rarely test", points: 1 }, { label: "No / not sure", points: 0 }],
    tip: "Keep backups isolated from production credentials and test restores on a schedule.",
  },
  {
    id: "access", text: "Do people only have the access their role requires, reviewed regularly?",
    options: [{ label: "Yes, reviewed on a schedule", points: 2 }, { label: "Partly", points: 1 }, { label: "No", points: 0 }],
    tip: "Apply least-privilege access and review permissions at least quarterly.",
  },
  {
    id: "ir", text: "Do you have a documented, practised incident response plan?",
    options: [{ label: "Yes, practised", points: 2 }, { label: "Documented, not practised", points: 1 }, { label: "No", points: 0 }],
    tip: "Write a short incident plan (who decides, acts, communicates) and rehearse it.",
  },
  {
    id: "compliance", text: "Can you show audit-ready evidence for the standards that apply to you?",
    options: [{ label: "Yes, on demand", points: 2 }, { label: "With effort", points: 1 }, { label: "No / not applicable yet", points: 0 }],
    tip: "Map controls to owners and automate evidence capture so audits are routine.",
  },
];

export type Level = "Strong" | "Developing" | "At risk";

export interface Result { score: number; max: number; percent: number; level: Level; tips: string[] }

export function scoreQuiz(answers: Record<string, number>): Result {
  const max = questions.length * 2;
  let score = 0;
  const tips: string[] = [];
  for (const q of questions) {
    const pts = answers[q.id] ?? 0;
    score += pts;
    if (pts < 2) tips.push(q.tip);
  }
  const percent = Math.round((score / max) * 100);
  const level: Level = percent >= 75 ? "Strong" : percent >= 40 ? "Developing" : "At risk";
  return { score, max, percent, level, tips };
}
