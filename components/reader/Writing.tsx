/** Before the first words arrive: three lines of the pen's wash, shimmering. */
import { useI18n } from "@/lib/ui-lang";

export function Writing({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`writing ${className}`} role="status" aria-label={t("reader.writing")}>
      <span style={{ width: "94%" }} />
      <span style={{ width: "82%" }} />
      <span style={{ width: "58%" }} />
    </div>
  );
}
