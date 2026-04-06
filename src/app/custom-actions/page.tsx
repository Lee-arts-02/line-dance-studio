import Link from "next/link";
import { CustomActionTrainer } from "@/components/CustomActionTrainer";

/**
 * Browser-only custom pose classifier training (separate from default rule-based gameplay).
 */
export default function CustomActionsPage() {
  return (
    <div>
      <div className="border-b border-[var(--border)] bg-[var(--bg)]/80 px-3 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-cyan-400/90 hover:text-cyan-300"
        >
          ← Back to main app
        </Link>
      </div>
      <CustomActionTrainer />
    </div>
  );
}
