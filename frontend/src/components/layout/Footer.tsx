export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="page-container py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            Play responsibly. 18+ only. Gambling can be addictive.
          </p>
          <div className="flex gap-6 text-sm">
            <span className="text-slate-500">Help</span>
            <span className="text-slate-500">Terms</span>
            <span className="font-medium text-slate-600">18+</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
