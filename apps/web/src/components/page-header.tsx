interface PageHeaderProps {
  title: string;
  description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <section className="hero">
      <h1>{title}</h1>
      <p className="muted">{description}</p>
    </section>
  );
}
