"use client";
// ABOUTME: Application editor/review surfaces composed from shadcn Sheet, Dialog and AlertDialog.
// ABOUTME: Radix owns focus containment; dirty drafts require explicit discard and return focus to the invoker.
import {
  useRef,
  useState,
  useEffect,
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { X } from "lucide-react";
const CloseContext = createContext<(() => void) | null>(null);
export function EditorCancel({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick">) {
  const close = useContext(CloseContext);
  if (!close) throw new Error("EditorCancel needs EditorPanel.");
  return (
    <Button type="button" variant="outline" {...props} onClick={close}>
      {children}
    </Button>
  );
}
export function EditorPanel({
  title,
  onClose,
  children,
  wide = false,
  dirty = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dirty?: boolean;
}) {
  const [confirm, setConfirm] = useState(false),
    heading = useRef<HTMLHeadingElement>(null),
    invoker = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function close() {
    if (dirty) setConfirm(true);
    else onClose();
  }
  function openFocus(e: Event) {
    invoker.current = document.activeElement as HTMLElement | null;
    e.preventDefault();
    heading.current?.focus();
  }
  function closeFocus(e: Event) {
    if (invoker.current?.isConnected) {
      e.preventDefault();
      invoker.current.focus();
    }
  }
  const header = (
    <>
      <div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Close ${title}`}
          onClick={close}
        >
          <X aria-hidden />
        </Button>
      </div>
    </>
  );
  const description =
    "Only Save applies changes. You can cancel or close to keep the saved version.";
  return (
    <CloseContext.Provider value={close}>
      {wide ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent
            className="review-dialog"
            showCloseButton={false}
            onOpenAutoFocus={openFocus}
            onCloseAutoFocus={closeFocus}
          >
            <DialogHeader className="editor-header">
              <DialogTitle ref={heading} tabIndex={-1}>
                {title}
              </DialogTitle>
              {header}
              <DialogDescription className="sr-only">
                Review the current and proposed values before applying a change.
              </DialogDescription>
            </DialogHeader>
            <div className="editor-scroll">{children}</div>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <SheetContent
            className="record-sheet"
            showCloseButton={false}
            onOpenAutoFocus={openFocus}
            onCloseAutoFocus={closeFocus}
          >
            <SheetHeader className="editor-header">
              <SheetTitle ref={heading} tabIndex={-1}>
                {title}
              </SheetTitle>
              {header}
              <SheetDescription className="sr-only">
                {description}
              </SheetDescription>
            </SheetHeader>
            <div className="editor-scroll">{children}</div>
          </SheetContent>
        </Sheet>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your saved records stay unchanged. The edits in this panel will be
              discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CloseContext.Provider>
  );
}
