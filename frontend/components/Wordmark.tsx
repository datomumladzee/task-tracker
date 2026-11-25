// "Task Tracker" in Sora with "Tracker" in lime. Used on the sign-in card,
// the sidebar and the phone top bar, all navy, where lime text is about
// 12.6:1. size="lg" is the sidebar's slightly larger version.

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`font-brand font-semibold ${size === "lg" ? "text-xl" : "text-[1.05rem]"}`}>
      Task <span className="text-lime">Tracker</span>
    </span>
  );
}
