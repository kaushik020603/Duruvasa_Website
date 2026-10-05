import { attributes, img, sections } from "../data/content";

export default function Attributes() {
  const a = sections.attributes;
  return (
    <section className="attributes">
      <div className="attr-left reveal" style={{ backgroundImage: `url(${img.circuit})` }}>
        <p className="eyebrow">{a.eyebrow}</p>
        <h2>{a.heading}</h2>
        <p>{a.text}</p>
        <a className="btn-light magnetic" href="#contact">{a.cta}</a>
      </div>
      <div className="attr-right">
        {attributes.map(({ title, text }, i) => (
          <article key={title + i} className="reveal attr-item">
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
