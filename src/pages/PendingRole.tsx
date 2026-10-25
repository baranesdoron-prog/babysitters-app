import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export function PendingRole({ email, requestedParent }: { email: string | null; requestedParent: boolean }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">נרשמת בהצלחה</p>
      <p className="text-muted-foreground">
        {requestedParent
          ? `בקשת ההורה של ${email} ממתינה לאישור. הגישה לנתוני המשפחה תיפתח רק לאחר האישור.`
          : `החשבון ${email} מחכה שאחד ההורים יקשר אותו. נסו שוב אחרי שקיבלתם אישור.`}
      </p>
      <Button variant="outline" onClick={() => supabase.auth.signOut()}>
        יציאה
      </Button>
    </div>
  )
}
