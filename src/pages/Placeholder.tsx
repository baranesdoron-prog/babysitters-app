export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">המסך הזה ייבנה בשלב הבא.</p>
    </div>
  )
}
