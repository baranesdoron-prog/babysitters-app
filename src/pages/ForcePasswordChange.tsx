import { KeyRound } from 'lucide-react'

import { PasswordForm } from '@/components/PasswordForm'
import { supabase } from '@/lib/supabase'

// First sign-in with a password someone else chose: pick your own before anything else.
export function ForcePasswordChange({ name, onDone }: { name: string | null; onDone: () => void }) {
  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4 py-8">
      <div className="bg-card flex w-full max-w-md flex-col gap-4 rounded-xl p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <KeyRound className="text-primary size-10" aria-hidden="true" />
          <h1 className="font-display text-[22px] font-semibold">{name ? `שלום ${name}!` : 'שלום!'}</h1>
          <p className="text-muted-foreground text-[15px]">
            נכנסתם עם סיסמה זמנית. בחרו סיסמה משלכם כדי להמשיך.
          </p>
        </div>
        <PasswordForm primary submitLabel="לשמור ולהמשיך" onDone={onDone} />
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="text-muted-foreground min-h-11 self-center text-[15px]"
        >
          יציאה
        </button>
      </div>
    </div>
  )
}
