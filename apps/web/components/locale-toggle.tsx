"use client";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocaleSwitch } from "@/lib/i18n/provider";
import { isLocale } from "@/lib/i18n/config";
const options = [
  { value: "am", label: "አማርኛ" },
  { value: "en", label: "English" },
  { value: "om", label: "Afaan Oromoo" },
  { value: "so", label: "Soomaali" },
];
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={t("language")}
          title={t("language")}
        >
          <Globe className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (isLocale(value)) setLocale(value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              lang={option.value}
              className="min-h-10"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
