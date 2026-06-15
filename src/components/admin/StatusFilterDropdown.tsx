"use client";

import { useRouter, useSearchParams } from "next/navigation";

type StatusFilterDropdownProps = {
  currentStatus: string;
  bookingStatusOptions: readonly string[];
};

export function StatusFilterDropdown({
  currentStatus,
  bookingStatusOptions,
}: StatusFilterDropdownProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", value);
    router.push(`/admin?${params.toString()}`);
  };

  return (
    <select
      name="status"
      value={currentStatus}
      onChange={handleChange}
      className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40 w-full"
    >
      {bookingStatusOptions.map((status) => (
        <option key={status} value={status} className="bg-slate-950 text-white">
          {status}
        </option>
      ))}
    </select>
  );
}
