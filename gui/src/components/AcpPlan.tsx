import {
  CheckCircleIcon,
  ClockIcon,
  PlayCircleIcon,
} from "@heroicons/react/24/outline";
import { useAppSelector } from "../redux/hooks";

export default function AcpPlan() {
  const currentPlan = useAppSelector((state) => state.session.currentPlan);

  if (!currentPlan || currentPlan.entries.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case "in_progress":
        return (
          <PlayCircleIcon className="h-5 w-5 animate-pulse text-blue-500" />
        );
      case "pending":
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "low":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  return (
    <div className="mx-4 mb-6 mt-2 overflow-hidden rounded-xl border border-solid border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md transition-all duration-300 ease-in-out hover:border-white/20">
      <div className="mb-4 flex items-center justify-between border-0 border-b border-solid border-white/10 pb-2">
        <h3 className="m-0 text-sm font-semibold tracking-tight text-white/90">
          Development Plan
        </h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          {currentPlan.entries.filter((e) => e.status === "completed").length} /{" "}
          {currentPlan.entries.length} Tasks
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {currentPlan.entries.map((entry, index) => (
          <div
            key={`${index}-${entry.content}`}
            className={`group relative flex items-start gap-3 rounded-lg p-2 transition-colors duration-200 hover:bg-white/5 ${
              entry.status === "completed" ? "opacity-60" : "opacity-100"
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {getStatusIcon(entry.status)}
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`flex rounded border border-solid px-1.5 py-0.5 text-xs font-medium capitalize leading-none ${getPriorityColor(
                    entry.priority,
                  )}`}
                >
                  {entry.priority}
                </span>
                <span
                  className={`text-sm leading-snug tracking-tight transition-all duration-200 ${
                    entry.status === "completed"
                      ? "text-white/40 line-through"
                      : "text-white/80"
                  }`}
                >
                  {entry.content}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
