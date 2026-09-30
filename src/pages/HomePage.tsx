import { Link, useNavigate } from 'react-router-dom'
import { HeroVisual } from '../components/HeroVisual'
import { Icon, type IconName } from '../components/Icon'
import { Reveal } from '../components/Reveal'
import { TrackingForm } from '../components/TrackingForm'
import { ProductSearch } from '../components/shop/ProductSearch'
import { useI18n } from '../i18n/context'
import { whatsappService } from '../services/whatsapp'

const SERVICE_ICONS: IconName[] = ['box', 'home', 'truck', 'truck', 'globe']
const TRUST_ICONS: IconName[] = ['truck', 'shield', 'pin', 'headset']
const STEP_ICONS: IconName[] = ['box', 'truck', 'search', 'home']

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL
const contactPhone = import.meta.env.VITE_CONTACT_PHONE

export function HomePage() {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-bg" aria-hidden="true">
          <span className="hero-glow hero-glow-1" />
          <span className="hero-glow hero-glow-2" />
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className={`hero-spark hero-spark-${index + 1}`} />
          ))}
        </div>

        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="hero-eyebrow-dot" aria-hidden="true" />
              {t.home.heroEyebrow}
            </p>
            <h1 id="hero-title">
              {t.home.heroTitleLines.map((line) => (
                <span key={line} className="hero-title-line">
                  {line}{' '}
                </span>
              ))}
              <span className="hero-title-line hero-highlight">{t.home.heroTitleHighlight}</span>
            </h1>
            <p className="hero-subtitle">{t.home.heroSubtitle}</p>
            <div className="hero-actions">
              <Link to="/pecas" className="btn btn-accent btn-lg btn-arrow">
                <Icon name="wrench" size={18} />
                {t.home.findPart}
                <Icon name="arrowRight" size={18} />
              </Link>
              <Link to="/rastrear" className="btn btn-outline-light btn-lg">
                <Icon name="search" size={18} />
                {t.home.trackParcel}
              </Link>
            </div>
            <p className="hero-secondary">
              <Link to="/shipments/new">{t.home.sendParcel}</Link>
              <span aria-hidden="true"> · </span>
              <Link to="/veiculos">{t.home.browseVehicles}</Link>
            </p>
          </div>

          <HeroVisual cards={t.home.heroCards} label={t.home.trustTitle} />
        </div>
      </section>

      <section className="section tracking-section" id="tracking" aria-labelledby="tracking-title">
        <div className="container dual-services">
          <div className="card tracking-card parts-card">
            <div className="tracking-card-head">
              <span className="tracking-card-icon" aria-hidden="true">
                <Icon name="wrench" size={26} />
              </span>
              <div>
                <h2 id="parts-title">{t.home.findPartTitle}</h2>
                <p className="muted">{t.home.findPartSubtitle}</p>
              </div>
            </div>
            <ProductSearch onSearch={(q) => navigate(q ? `/pecas?q=${encodeURIComponent(q)}` : '/pecas')} />
            <p className="parts-card-links">
              <Link to="/veiculos">{t.home.browseVehicles}</Link>
              <Link to="/categorias">{t.home.browseCategories}</Link>
              <Link to="/pecas">{t.home.askAssistant}</Link>
            </p>
          </div>
          <div className="card tracking-card">
            <div className="tracking-card-head">
              <span className="tracking-card-icon" aria-hidden="true">
                <Icon name="pin" size={26} />
              </span>
              <div>
                <h2 id="tracking-title">{t.home.trackingTitle}</h2>
                <p className="muted">{t.home.trackingSubtitle}</p>
              </div>
            </div>
            <TrackingForm />
          </div>
        </div>
      </section>

      <section className="section benefits-section" aria-labelledby="trust-title">
        <div className="container">
          <h2 id="trust-title" className="sr-only">
            {t.home.trustTitle}
          </h2>
          <div className="benefits">
            {t.home.trust.map((item, index) => (
              <Reveal key={index} className="benefit" delay={index * 90}>
                <span className="benefit-icon" aria-hidden="true">
                  <Icon name={TRUST_ICONS[index] ?? 'globe'} size={28} />
                </span>
                <h3>{item.title}</h3>
                <p className="muted">{item.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="container">
          <Reveal as="header" className="section-header">
            <h2 id="how-title">{t.home.howTitle}</h2>
            <p className="muted">{t.home.howSubtitle}</p>
          </Reveal>
          <div className="steps-wrap">
            <div className="steps-track" aria-hidden="true">
              <span className="steps-track-runner" />
            </div>
            <ol className="steps">
              {t.home.steps.map((step, index) => (
                <Reveal as="li" key={index} className="step" delay={index * 120}>
                  <span className="step-number" style={{ animationDelay: `${index * 0.6}s` }}>
                    {index + 1}
                  </span>
                  <div className="step-card">
                    <span className="step-icon" aria-hidden="true">
                      <Icon name={STEP_ICONS[index] ?? 'box'} size={22} />
                    </span>
                    <h3>{step.title}</h3>
                    <p className="muted">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section" id="services" aria-labelledby="services-title">
        <div className="container">
          <Reveal as="header" className="section-header">
            <h2 id="services-title">{t.home.servicesTitle}</h2>
            <p className="muted">{t.home.servicesSubtitle}</p>
          </Reveal>
          <div className="grid grid-auto">
            {t.home.services.map((service, index) => (
              <Reveal as="article" key={index} className="card feature-card" delay={index * 80}>
                <span className="feature-icon">
                  <Icon name={SERVICE_ICONS[index] ?? 'box'} />
                </span>
                <h3>{service.title}</h3>
                <p className="muted">{service.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="contacts" aria-labelledby="contacts-title">
        <div className="container contacts">
          <Reveal>
            <h2 id="contacts-title">{t.home.contactsTitle}</h2>
            <p className="muted">{t.home.contactsText}</p>
          </Reveal>
          <Reveal className="card contact-card" delay={120}>
            {contactEmail || contactPhone || whatsappService.isConfigured ? (
              <ul className="contact-list">
                {contactEmail && (
                  <li>
                    <Icon name="mail" size={20} />
                    <span>
                      {t.home.contactEmail}: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                    </span>
                  </li>
                )}
                {contactPhone && (
                  <li>
                    <Icon name="phone" size={20} />
                    <span>
                      {t.home.contactPhone}: <a href={`tel:${contactPhone.replace(/\s/g, '')}`}>{contactPhone}</a>
                    </span>
                  </li>
                )}
                {/* Both countries are listed here: the visitor picks the one that suits them. */}
                {whatsappService.regions.map((region) => (
                  <li key={region}>
                    <Icon name="chat" size={20} />
                    <span>
                      {region === 'PT' ? t.specialist.whatsappPt : t.specialist.whatsappEs}:{' '}
                      <a
                        href={whatsappService.link({}, t, region)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-region={region}
                      >
                        {whatsappService.displayNumber(region)}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.home.contactsUnavailable}</p>
            )}
          </Reveal>
        </div>
      </section>
    </div>
  )
}
