import { toast } from "@/components/ui/toast";

export function toastError(title: string, description?: string) {
  toast.add({
    type: "error",
    title,
    ...(description ? { description } : {}),
  });
}

export function toastInfo(title: string, description?: string) {
  toast.add({
    type: "info",
    title,
    ...(description ? { description } : {}),
  });
}

export function toastInfoWithAction(
  title: string,
  description: string | undefined,
  actionLabel: string,
  onAction: () => void,
) {
  const id = toast.add({
    type: "info",
    title,
    ...(description ? { description } : {}),
    actionProps: {
      children: actionLabel,
      onClick: () => {
        toast.close(id);
        onAction();
      },
    },
  });
}
