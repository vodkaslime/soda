import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t("common.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("common.cancel");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm rounded-xl bg-surface border border-border shadow-xl p-6 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <Dialog.Title className="text-base font-medium text-text-primary mb-2">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-text-secondary leading-relaxed mb-6">
            {description}
          </Dialog.Description>
          <div className="flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-lg border border-border bg-surface text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all duration-150 cursor-pointer font-medium">
                {resolvedCancelLabel}
              </button>
            </Dialog.Close>
            <button
              className="px-4 py-2 rounded-lg bg-coral text-white text-sm font-medium cursor-pointer transition-colors duration-150 hover:bg-coral/90"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {resolvedConfirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
