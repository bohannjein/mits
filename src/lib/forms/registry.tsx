"use client";

import { InfoIcon, PaperclipIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/forms/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ResolvedField } from "@/lib/forms/schema-to-zod";
import type { MITSFieldWidget } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Field registry: JSON-Schema field → shadcn control.

   One entry per widget. Every entry renders the full field — label, optional
   description and tooltip, the control itself, and the zod error via
   <FormMessage>. Adding a widget means adding a key here and to MITSFieldWidget;
   no form template ever changes.
   ────────────────────────────────────────────────────────────────────────── */

export interface FieldProps {
  field: ResolvedField;
  disabled?: boolean;
}

/**
 * Shared chrome around every control, so a new widget cannot forget the label,
 * the help text or the error message.
 */
function FieldShell({
  field,
  children,
  /** Booleans put the control beside the label instead of under it. */
  inline = false,
}: {
  field: ResolvedField;
  children: ReactNode;
  inline?: boolean;
}) {
  const description = field.hint.help ?? field.schema.description;

  const labelRow = (
    <div className="flex items-center gap-1.5">
      <FormLabel>
        {field.label}
        {field.required && (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </FormLabel>
      {field.hint.tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Hinweis zu ${field.label}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{field.hint.tooltip}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  if (inline) {
    return (
      <FormItem className="flex flex-row items-start gap-3 rounded-sm border-2 border-border p-3">
        <div className="mt-0.5">{children}</div>
        <div className="grid gap-1">
          {labelRow}
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </div>
      </FormItem>
    );
  }

  return (
    <FormItem>
      {labelRow}
      {children}
      {description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
}

function TextField({ field, disabled }: FieldProps) {
  const type =
    field.widget === "email"
      ? "email"
      : field.widget === "date"
        ? "date"
        : field.widget === "number"
          ? "number"
          : "text";

  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => (
        <FieldShell field={field}>
          <FormControl>
            <Input
              {...rhf}
              value={(rhf.value as string | number | undefined) ?? ""}
              type={type}
              inputMode={field.widget === "number" ? "numeric" : undefined}
              step={field.widget === "number" ? (field.schema.multipleOf ?? undefined) : undefined}
              placeholder={field.hint.placeholder}
              disabled={disabled}
              className="rounded-sm"
            />
          </FormControl>
        </FieldShell>
      )}
    />
  );
}

function TextareaField({ field, disabled }: FieldProps) {
  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => (
        <FieldShell field={field}>
          <FormControl>
            <Textarea
              {...rhf}
              value={(rhf.value as string | undefined) ?? ""}
              placeholder={field.hint.placeholder}
              disabled={disabled}
              rows={5}
              className="rounded-sm"
            />
          </FormControl>
        </FieldShell>
      )}
    />
  );
}

function SelectField({ field, disabled }: FieldProps) {
  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => (
        <FieldShell field={field}>
          <Select
            value={(rhf.value as string | undefined) || undefined}
            onValueChange={rhf.onChange}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className="h-9 w-full rounded-sm">
                <SelectValue
                  placeholder={field.hint.placeholder ?? "Bitte wählen"}
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}

function RadioField({ field, disabled }: FieldProps) {
  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => (
        <FieldShell field={field}>
          <FormControl>
            <RadioGroup
              value={(rhf.value as string | undefined) ?? ""}
              onValueChange={rhf.onChange}
              disabled={disabled}
              className="gap-2"
            >
              {field.options?.map((option) => {
                const id = `${field.name}-${option.value}`;
                return (
                  <div key={option.value} className="flex items-center gap-2.5">
                    <RadioGroupItem value={option.value} id={id} />
                    <Label htmlFor={id} className="font-normal">
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </FormControl>
        </FieldShell>
      )}
    />
  );
}

function MultiSelectField({ field, disabled }: FieldProps) {
  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => {
        const selected = Array.isArray(rhf.value) ? (rhf.value as string[]) : [];

        const toggle = (value: string, checked: boolean) =>
          rhf.onChange(
            checked
              ? [...selected, value]
              : selected.filter((entry) => entry !== value),
          );

        return (
          <FieldShell field={field}>
            <FormControl>
              <div className="grid gap-2 rounded-sm border-2 border-border p-3 sm:grid-cols-2">
                {field.options?.map((option) => {
                  const id = `${field.name}-${option.value}`;
                  return (
                    <div key={option.value} className="flex items-center gap-2.5">
                      <Checkbox
                        id={id}
                        checked={selected.includes(option.value)}
                        onCheckedChange={(checked) =>
                          toggle(option.value, checked === true)
                        }
                        disabled={disabled}
                      />
                      <Label htmlFor={id} className="font-normal">
                        {option.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </FormControl>
          </FieldShell>
        );
      }}
    />
  );
}

function CheckboxField({ field, disabled }: FieldProps) {
  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => (
        <FieldShell field={field} inline>
          <FormControl>
            <Checkbox
              checked={rhf.value === true}
              onCheckedChange={(checked) => rhf.onChange(checked === true)}
              disabled={disabled}
            />
          </FormControl>
        </FieldShell>
      )}
    />
  );
}

function SwitchField({ field, disabled }: FieldProps) {
  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => (
        <FieldShell field={field} inline>
          <FormControl>
            <Switch
              checked={rhf.value === true}
              onCheckedChange={rhf.onChange}
              disabled={disabled}
            />
          </FormControl>
        </FieldShell>
      )}
    />
  );
}

function FileField({ field, disabled }: FieldProps) {
  const accept =
    typeof field.hint.accept === "string" ? field.hint.accept : undefined;
  const multiple = field.schema.type === "array";

  return (
    <FormField
      name={field.name}
      render={({ field: rhf }) => {
        const files = Array.isArray(rhf.value) ? (rhf.value as File[]) : [];

        return (
          <FieldShell field={field}>
            {/* A file input's value cannot be set programmatically, so `rhf.value`
                is deliberately not spread onto it — the list below is the UI state. */}
            <FormControl>
              <Input
                type="file"
                name={rhf.name}
                ref={rhf.ref}
                onBlur={rhf.onBlur}
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                className="h-9 rounded-sm py-1.5"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  rhf.onChange(multiple ? [...files, ...picked] : picked);
                }}
              />
            </FormControl>
            {files.length > 0 && (
              <ul className="grid gap-1.5">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-sm border-2 border-border px-2.5 py-1.5"
                  >
                    <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{file.name}</span>
                    <Badge variant="outline" className="ml-auto rounded-sm font-mono">
                      {Math.max(1, Math.round(file.size / 1024))} KB
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${file.name} entfernen`}
                      disabled={disabled}
                      onClick={() =>
                        rhf.onChange(files.filter((_, i) => i !== index))
                      }
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </FieldShell>
        );
      }}
    />
  );
}

/** Widget → renderer. The single lookup table the form engine walks. */
export const FIELD_REGISTRY: Record<
  MITSFieldWidget,
  (props: FieldProps) => ReactNode
> = {
  text: TextField,
  email: TextField,
  date: TextField,
  number: TextField,
  textarea: TextareaField,
  select: SelectField,
  radio: RadioField,
  multiselect: MultiSelectField,
  checkbox: CheckboxField,
  switch: SwitchField,
  file: FileField,
};

/** Render one resolved field, falling back to a text input for unknown widgets. */
export function renderField(props: FieldProps) {
  const Renderer = FIELD_REGISTRY[props.field.widget] ?? TextField;
  return <Renderer key={props.field.name} {...props} />;
}
