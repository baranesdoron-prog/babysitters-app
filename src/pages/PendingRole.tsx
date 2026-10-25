import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export function PendingRole({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">נרשמת בהצלחה</p>
      <p className="text-muted-foreground">
        החשבון {email} מחכה שאחד ההורים יקשר אותו. נסו שוב אחרי שקיבלתם אישור.
      </p>
      <Button variant="outline" onClick={() => supabase.auth.signOut()}>
        יציאה
      </Button>
    </div>
  )
}
