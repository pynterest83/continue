import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

interface QuestionOption {
  label: string;
  description?: string;
}

interface QuestionItem {
  question: string;
  header?: string;
  options?: QuestionOption[];
}

interface QuestionToolCallProps {
  questions: QuestionItem[];
  historyIndex: number;
}

export function QuestionToolCall({
  questions,
  historyIndex,
}: QuestionToolCallProps) {
  const [customAnswer, setCustomAnswer] = useState("");
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!questions || questions.length === 0) {
    return null;
  }

  const currentQuestion = questions[currentQIndex];
  const { header, question: text, options } = currentQuestion;

  const submitAnswer = (answer: string) => {
    // Save the answer
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    if (currentQIndex < questions.length - 1) {
      // Move to next question
      setCurrentQIndex(currentQIndex + 1);
      setCustomAnswer(""); // Reset custom answer input
    } else {
      setIsSubmitted(true);
      // Finished all questions
      // Format the final output. You can adjust this format as needed.
      // Here we combine Q and A for clarity, or just send answers.
      // Let's send a readable format.
      const finalInput = questions
        .map((q, i) => {
          const ans = newAnswers[i];
          return `Question: ${q.question}\nAnswer: ${ans}`;
        })
        .join("\n\n");

      window.postMessage(
        {
          messageType: "submitMessage",
          data: {
            text: finalInput,
          },
        },
        "*",
      );
    }
  };

  return (
    <div
      className={`mx-4 mb-4 mt-2 overflow-hidden rounded-xl border border-solid border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-md transition-opacity duration-300 ${isSubmitted ? "opacity-60" : ""}`}
    >
      <div className="mb-3 flex items-center gap-2 border-0 border-b border-solid border-white/10 pb-2">
        <QuestionMarkCircleIcon className="h-5 w-5 text-blue-400" />
        <h3 className="m-0 text-sm font-semibold text-white/90">
          {header || "Clarification Needed"}
          {questions.length > 1 && (
            <span className="ml-2 text-xs font-normal text-white/50">
              ({currentQIndex + 1}/{questions.length})
            </span>
          )}
        </h3>
      </div>

      <div className="mb-4">
        <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
          {text}
        </p>
      </div>

      {options && options.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => submitAnswer(option.label)}
              disabled={isSubmitted}
              className={`flex flex-col items-start gap-1 rounded-lg border border-solid border-white/10 bg-white/5 px-3 py-2 text-left transition-all duration-200 ${
                isSubmitted
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/10 active:scale-[0.98]"
              }`}
            >
              <span className="text-xs font-semibold text-blue-400">
                {option.label}
              </span>
              {option.description && (
                <span className="text-[11px] italic leading-tight text-white/50">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          Custom Answer
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customAnswer}
            onChange={(e) => setCustomAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customAnswer.trim() && !isSubmitted) {
                submitAnswer(customAnswer);
              }
            }}
            disabled={isSubmitted}
            placeholder={
              isSubmitted ? "Answer submitted" : "Type your answer here..."
            }
            className="flex-1 rounded-lg border border-solid border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/90 placeholder-white/30 focus:border-blue-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={() => {
              if (customAnswer.trim() && !isSubmitted) {
                submitAnswer(customAnswer);
              }
            }}
            disabled={!customAnswer.trim() || isSubmitted}
            className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitted ? "Sent" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
