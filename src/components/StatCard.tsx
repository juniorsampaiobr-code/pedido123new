interface StatCardProps {
  value: string;
  label: string;
  delay?: number;
}

export const StatCard = ({ value, label, delay = 0 }: StatCardProps) => {
  return (
    <div 
      className="text-center animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
        {value}
      </div>
      <div className="text-sm text-muted-foreground">
        {label}
      </div>
    </div>
  );
};
