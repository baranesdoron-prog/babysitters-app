import { Clock } from 'lucide-react'

import { supabase } from '@/lib/supabase'

// A login without a role yet (it should not normally happen: parents create
// every login with its role). Says so plainly instead of a blank screen.
export function PendingRole() {
  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4">
      <div className="bg-card flex w-full max-w-md flex-col items-center gap-3 rounded-xl p-6 text-center">
        <Clock className="text-primary size-10" aria-hidden="true" />
        <h1 className="font-display text-[22px] font-semibold">החשבון עוד לא מוכן</h1>
        <p className="text-muted-foreground text-[15px]">
          ההורים צריכים להשלים את ההגדרה של החשבון הזה. אפשר לנסות שוב אחר כך.
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="text-primary min-h-11 text-[15px] font-semibold"
        >
          יציאה
        </button>
      </div>
    </div>
  )
}
