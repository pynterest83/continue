import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../../../redux/hooks";
import { CONFIG_ROUTES } from "../../../util/navigation";
import { ToolTip } from "../../gui/Tooltip";
import { LumpToolbar } from "./LumpToolbar/LumpToolbar";

/**
 * Warning banner that shows when Auto (High Risk) is enabled for terminal commands
 */
function HighRiskWarningBanner() {
  const navigate = useNavigate();
  const bypassHighRisk = useAppSelector(
    (state) => state.ui.toolBypassHighRisk["run_terminal_command"] ?? false,
  );
  const terminalPolicy = useAppSelector(
    (state) => state.ui.toolSettings["run_terminal_command"],
  );

  // Only show if both Automatic is set AND high risk bypass is enabled
  if (terminalPolicy !== "allowedWithoutPermission" || !bypassHighRisk) {
    return null;
  }

  return (
    <div className="flex justify-start px-1 pt-1">
      <ToolTip
        content="High risk commands (npm install, curl, etc.) will be auto-approved. Click to go to settings."
        place="right"
      >
        <button
          onClick={() => navigate(CONFIG_ROUTES.TOOLS)}
          className="text-2xs flex cursor-pointer items-center gap-1 rounded bg-yellow-600 px-1.5 py-0.5 text-white transition-colors hover:bg-yellow-700"
        >
          <ExclamationTriangleIcon className="h-3 w-3" />
          <span>High Risk</span>
        </button>
      </ToolTip>
    </div>
  );
}

/**
 * Simplified toolbar component that only shows the toolbar without expansion
 */
export function Lump() {
  return (
    <div className="bg-input rounded-t-default border-command-border mx-1.5 border-l border-r border-t">
      <HighRiskWarningBanner />
      <div className="xs:px-2 px-1 py-0.5">
        <LumpToolbar />
      </div>
    </div>
  );
}
