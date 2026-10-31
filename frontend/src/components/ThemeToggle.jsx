import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle({ variant = "segmented" }) {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "Auto", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  if (variant === "compact") {
    // Single button that cycles through light -> dark -> system
    const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    const CurrentIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

    return (
      <button
        onClick={() => setTheme(nextTheme)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/80 text-[#1d1d1f] backdrop-blur-md transition-all hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/40 dark:border-white/15 dark:bg-[#1c1c1e]/80 dark:text-[#f5f5f7] dark:hover:bg-[#2c2c2e]"
        title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (Click to switch)`}
        aria-label="Toggle theme"
      >
        <CurrentIcon size={16} />
      </button>
    );
  }

  // Segmented Apple-style control
  return (
    <div
      role="radiogroup"
      aria-label="Color theme selector"
      className="inline-flex items-center rounded-full border border-black/8 bg-black/[0.04] p-0.5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.08]"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(value)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              isActive
                ? "bg-white text-[#1d1d1f] shadow-sm dark:bg-[#2c2c2e] dark:text-[#f5f5f7]"
                : "text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7]"
            }`}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
