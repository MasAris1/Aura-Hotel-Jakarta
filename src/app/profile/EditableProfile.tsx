"use client";

import { useState } from "react";
import { Check, Edit2, Loader2, X } from "lucide-react";
import { updateProfile } from "./actions";
import { useRouter } from "next/navigation";

type EditableProfileProps = {
  initialFirstName: string;
  initialLastName: string;
  email: string;
  role: string;
  initials: string;
};

export function EditableProfile({
  initialFirstName,
  initialLastName,
  email,
  role,
  initials,
}: EditableProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const fullName =
    `${initialFirstName} ${initialLastName}`.trim() ||
    email.split("@")[0] ||
    "Guest";

  async function handleSave() {
    setIsPending(true);
    try {
      const formData = new FormData();
      formData.append("first_name", firstName);
      formData.append("last_name", lastName);
      await updateProfile(formData);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-5">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 font-playfair text-3xl text-primary">
        {initials || "G"}
      </div>
      <div className="flex-1">
        {isEditing ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
              className="w-full border border-input bg-background/40 px-3 py-2 font-inter text-sm text-foreground transition-colors placeholder:text-foreground/20 focus:border-primary focus:outline-none sm:w-40"
              disabled={isPending}
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last Name"
              className="w-full border border-input bg-background/40 px-3 py-2 font-inter text-sm text-foreground transition-colors placeholder:text-foreground/20 focus:border-primary focus:outline-none sm:w-40"
              disabled={isPending}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex h-9 w-9 items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setFirstName(initialFirstName);
                  setLastName(initialLastName);
                }}
                disabled={isPending}
                className="inline-flex h-9 w-9 items-center justify-center border border-border text-foreground/70 transition-colors hover:border-primary/35 hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="group flex items-center gap-3">
            <h2 className="font-playfair text-2xl text-foreground">
              {fullName}
            </h2>
            <button
              onClick={() => setIsEditing(true)}
              className="text-foreground/50 transition-opacity hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
              title="Edit Profile"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </div>
        )}
        <p className="mt-2 font-inter text-xs uppercase tracking-[0.24em] text-foreground/45">
          {role ?? "guest"}
        </p>
      </div>
    </div>
  );
}
