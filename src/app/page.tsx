"use client";
/* eslint-disable @next/next/no-img-element -- this page uses responsive image cards and decorative PNG assets */

import { useEffect, useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePersistentState } from "@/app/components/usePersistentState";
import { SystemNavigation } from "@/app/components/SystemNavigation";

type Language = "en" | "ja" | "fr" | "zh";

// GitHub Pages hosts this package below a repository subdirectory (`/shuizhi/`).
// Build every public-image URL from the page directory so the same URL works on
// both desktop and mobile browsers instead of incorrectly requesting `/images/*`.
const publicAssetBase = new URL(
  `${window.location.pathname.replace(/\/$/, "")}/`,
  window.location.origin,
);
const publicAsset = (path: string) => new URL(path.replace(/^\//, ""), publicAssetBase).href;

const languageLabels: Record<Language, string> = {
  en: "EN",
  ja: "日",
  fr: "FR",
  zh: "中",
};

const oceanGalleryRows = [
  [
    { src: publicAsset("images/home/oyster-open.png"), alt: "水下张开的牡蛎" },
    { src: publicAsset("images/home/scallop-open.png"), alt: "水下张开的扇贝" },
    { src: publicAsset("images/home/oyster-closed.png"), alt: "水下闭合的牡蛎" },
    { src: publicAsset("images/home/clam.png"), alt: "水下闭合的蛤蜊" },
  ],
  [
    { src: publicAsset("images/home/mussel.png"), alt: "水下黑色贻贝" },
    { src: publicAsset("images/home/shellfish-larvae.png"), alt: "水中的贝类浮游幼体" },
    { src: publicAsset("images/home/marine-fish.png"), alt: "水下海水鱼" },
    { src: publicAsset("images/home/abalone.png"), alt: "水下鲍鱼" },
  ],
] as const;

// 四张项目卡片各配一组图（每组 3 张，主图各不相同，任意两组最多共用 1 张），避免卡片之间看起来雷同。
// 主图位只用横向物种图：project-glass-cube 是竖版装饰图（宽高比 0.95），放进 1.37 等比外框会被大幅裁掉。
const imageSets = [
  [
    publicAsset("images/home/oyster-open.png"),
    publicAsset("images/home/scallop-open.png"),
    publicAsset("images/home/marine-fish.png"),
  ],
  [
    publicAsset("images/home/shellfish-larvae.png"),
    publicAsset("images/home/clam.png"),
    publicAsset("images/home/mussel.png"),
  ],
  [
    publicAsset("images/home/mussel.png"),
    publicAsset("images/home/oyster-closed.png"),
    publicAsset("images/home/abalone.png"),
  ],
  [
    publicAsset("images/home/oyster-closed.png"),
    publicAsset("images/home/scallop-open.png"),
    publicAsset("images/home/clam.png"),
  ],
];

// 与站内导航保持一致：投放记录与投放后监测已合并为「投放管理」一个入口，故共 4 项。
const projectLinks = ["/main", "/main/alerts", "/main/pools", "/main/dosing-records"] as const;

const translations = {
  en: {
    nav: ["About", "Services", "Projects"],
    hero: "Hatchery Monitor",
    aboutTitle: "About the Project",
    aboutLines: [
      "Built for shellfish hatcheries, the platform continuously monitors six metrics — water temperature, pH, dissolved oxygen, salinity, turbidity and ammonia nitrogen — across four hatchery pools, and classifies each reading as normal, warning or critical.",
      "Those readings feed four areas: the dashboard gathers each pool's status, gauge dials and trends onto one screen; the alert centre grades every exception and records its handling status and notes; pool management keeps each pool's profile and exports a report; dosing management logs each dosing event and reviews water quality afterwards.",
      "Both a demo data source and a live data source are supported, so the site stays fully demonstrable without devices and switches to real monitoring once sensors are connected.",
    ],
    services: "Services",
    project: "Project",
    live: "Live Project",
    back: "Back to top ↑",
    marqueeAlt: "3D motion project preview",
    serviceItems: [
      ["Integrated Dashboard", "Six metric gauges show each hatchery pool's live water quality, alongside warning and exception summaries, four monitoring scenarios and trends over several time ranges."],
      ["Exception Alert Centre", "Manages alerts as unhandled, in progress, under observation or closed, showing the affected metric, severity and system advice, with status transitions, handling notes and an event timeline."],
      ["Hatchery Pool Management", "Centralises pools, species, batches and operators, shows current water quality and historical trends, and gathers each pool's exception, dosing and post-dosing records into an exportable report."],
      ["Dosing Management", "Keeps a ledger of every dosing event — agent, concentration, dosage, operator and result — and creates a matching post-dosing task that compares water quality before and after and evaluates the outcome."],
    ],
    projects: [
      ["Integrated Dashboard", "System Overview"],
      ["Exception Alert Centre", "Alert Management"],
      ["Hatchery Pool Management", "Data Management"],
      ["Dosing Management", "Dosing & Review"],
    ],
  },
  ja: {
    nav: ["私について", "サービス", "作品"],
    hero: "種苗生産モニター",
    aboutTitle: "プロジェクトについて",
    aboutLines: [
      "貝類の種苗生産現場に向けたプラットフォームです。4 つの育苗池で水温・pH・溶存酸素・塩分・濁度・アンモニア態窒素の 6 項目を継続監視し、正常・警報・異常の 3 段階で自動判定します。",
      "計測データは 4 つの機能で活用します。統合ダッシュボードは池の稼働状況・計器・推移を一画面に集約し、異常警報センターは警報の等級・対応状況・メモを管理、育苗池管理は池の台帳と履歴をまとめて報告書を出力、投入管理は投入台帳を記録し投入後の水質回復と効果を確認します。",
      "演示用とリアルタイムの 2 つのデータソースに対応し、設備がなくても全体を演示でき、センサー接続時はそのまま実運用の監視に切り替わります。",
    ],
    services: "サービス",
    project: "プロジェクト",
    live: "プロジェクトを見る",
    back: "トップへ ↑",
    marqueeAlt: "3Dモーション作品プレビュー",
    serviceItems: [
      ["統合ダッシュボード", "6 つの計器で各育苗池の水質をリアルタイム表示し、警報・異常の概要、4 つの監視シーン、複数時間軸の推移を一画面にまとめます。"],
      ["異常警報センター", "警報を未対応・対応中・経過観察・完了で管理し、異常項目・等級・システム提案を表示。対応状況の変更、メモ、イベント履歴を記録します。"],
      ["育苗池管理", "育苗池・品種・ロット・担当者を一元管理し、現在の水質と履歴傾向を表示。異常・投入・投入後監視の記録をまとめ、報告書を出力できます。"],
      ["投入管理", "投入ごとに薬剤・濃度・投与量・担当者・結果を台帳に記録し、投入後監視タスクを同時に作成。投入前後の水質比較と回復状況から効果を評価します。"],
    ],
    projects: [
      ["統合ダッシュボード", "システム概要"],
      ["異常警報センター", "警報管理"],
      ["育苗池管理", "データ管理"],
      ["投入管理", "投入と効果確認"],
    ],
  },
  fr: {
    nav: ["À propos", "Services", "Projets"],
    hero: "Suivi aquacole",
    aboutTitle: "À propos du projet",
    aboutLines: [
      "Conçue pour l'élevage larvaire des coquillages, la plateforme surveille en continu six paramètres — température, pH, oxygène dissous, salinité, turbidité et azote ammoniacal — sur quatre bassins, avec un classement automatique en normal, alerte ou critique.",
      "Ces données alimentent quatre espaces : le tableau de bord réunit l'état des bassins, les cadrans et les tendances ; le centre d'alerte gère le niveau, le traitement et les notes de chaque anomalie ; la gestion des bassins centralise les fiches et exporte un rapport ; la gestion des traitements consigne chaque intervention et évalue la qualité de l'eau ensuite.",
      "Deux sources de données sont prises en charge, démonstration et temps réel : le site reste entièrement démontrable sans matériel et bascule en suivi réel dès le raccordement des capteurs.",
    ],
    services: "Services",
    project: "Projet",
    live: "Voir le projet",
    back: "Retour en haut ↑",
    marqueeAlt: "Aperçu de projet 3D animé",
    serviceItems: [
      ["Tableau de bord intégré", "Six cadrans présentent la qualité de l'eau en temps réel de chaque bassin, avec la synthèse des alertes et anomalies, quatre scénarios de suivi et des tendances sur plusieurs périodes."],
      ["Centre d'alerte", "Classe les alertes en non traitée, en cours, sous observation ou clôturée, affiche le paramètre, le niveau et les recommandations, et conserve le flux de statut, les notes et la chronologie."],
      ["Gestion des bassins", "Centralise bassins, espèces, lots et responsables, affiche la qualité de l'eau actuelle et les tendances, et réunit anomalies, traitements et suivis dans un rapport exportable."],
      ["Gestion des traitements", "Consigne chaque intervention — produit, concentration, dose, opérateur et résultat — et crée la tâche de suivi associée, qui compare l'eau avant/après et évalue l'effet obtenu."],
    ],
    projects: [
      ["Tableau de bord intégré", "Vue d'ensemble"],
      ["Centre d'alerte", "Gestion d'alerte"],
      ["Gestion des bassins", "Gestion des données"],
      ["Gestion des traitements", "Traitement & suivi"],
    ],
  },
  zh: {
    nav: ["关于项目", "服务", "项目"],
    hero: "贝类育苗监测",
    aboutTitle: "关于项目",
    aboutLines: [
      "平台面向贝类育苗场景，对 4 个育苗池的水温、pH、溶解氧、盐度、浊度、氨氮六项指标持续监测，并按正常、预警、异常三级自动判定水质状态。",
      "监测数据围绕四个功能区展开：综合驾驶舱把各池运行状态、指标仪表盘与趋势集中到一屏；异常预警中心对每条异常分级，并记录处理状态与处理备注；育苗池管理汇总池档案与历史记录、可导出育苗池报告；投放管理留存投放台账，并回访投放后的水质恢复与效果。",
      "支持演示与实时双数据源：无设备时可完整演示，接入真实传感器后即为实时监测。",
    ],
    services: "服务",
    project: "项目",
    live: "查看项目",
    back: "返回顶部 ↑",
    marqueeAlt: "3D 动态项目预览",
    serviceItems: [
      ["综合驾驶舱", "用 6 个指标仪表盘呈现各育苗池的实时水质，汇总预警与异常摘要，支持 4 种监测场景切换与多时间尺度趋势查看，一屏掌握全局运行状态。"],
      ["异常预警中心", "按未处理、处理中、观察中、已关闭管理预警，展示异常指标、等级与系统建议，支持处理状态流转、处理备注与事件时间线留痕。"],
      ["育苗池管理", "集中管理育苗池、苗种、批次与负责人信息，查看当前水质与历史趋势，并汇总该池的异常、投放与投放后监测记录，可一键导出育苗池报告。"],
      ["投放管理", "投放记录以台账留存药剂、浓度、剂量、操作人与结果，并同步建立投放后监测任务；监测页对比投放前后水质、跟踪指标恢复进度并给出效果评价。"],
    ],
    projects: [
      ["综合驾驶舱", "系统总览"],
      ["异常预警中心", "预警管理"],
      ["育苗池管理", "数据管理"],
      ["投放管理", "投放与回访"],
    ],
  },
} satisfies Record<Language, Record<string, unknown>>;

type Copy = (typeof translations)[Language];

function FadeIn({
  children,
  delay = 0,
  duration = 0.7,
  x = 0,
  y = 30,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  x?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "50px", amount: 0 }}
      transition={{ delay, duration, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

function LanguageSwitcher({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <div className="language-switcher" aria-label="Language selector">
      {(Object.keys(languageLabels) as Language[]).map((key) => (
        <button
          key={key}
          type="button"
          className={language === key ? "active" : ""}
          onClick={() => onChange(key)}
          aria-pressed={language === key}
        >
          {languageLabels[key]}
        </button>
      ))}
    </div>
  );
}

function HeroSection({
  copy,
  language,
  setLanguage,
}: {
  copy: Copy;
  language: Language;
  setLanguage: (language: Language) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const backgroundY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : ["-3.5%", "3.5%"],
  );

  return (
    <section ref={ref} className="hero" id="home">
      <motion.div
        className="section-scroll-background hero-scroll-background"
        style={{ y: backgroundY }}
        aria-hidden="true"
      />
      <div className="intro-nav-overlay">
        <span className="hero-lang-slot">
          <LanguageSwitcher language={language} onChange={setLanguage} />
        </span>
      </div>
      <FadeIn delay={0.15} y={40} className="hero-heading-wrap">
        <p className="intro-eyebrow">SHELLFISH MONITORING</p>
        <h1 className="hero-heading hero-title">{copy.hero}</h1>
        <p className="intro-hero-description">{copy.aboutLines[0]}</p>
        <div className="intro-hero-actions">
          <Link className="intro-primary-link" href="/main">
            {copy.projects[0][0]} <ArrowUpRight size={18} />
          </Link>
          <a className="intro-secondary-link" href="#about">{copy.nav[0]}</a>
        </div>
      </FadeIn>
      <FadeIn delay={0.35} y={20} className="hero-nav-wrap">
        <nav className="hero-nav" aria-label="Primary navigation">
          <div className="nav-links">
            <a href="#about">{copy.nav[0]}</a>
            <a href="#services">{copy.nav[1]}</a>
            <a href="#projects">{copy.nav[2]}</a>
          </div>
        </nav>
      </FadeIn>
    </section>
  );
}

function MarqueeSection() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const firstRowX = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0vw", "0vw"] : ["4vw", "-8vw"],
  );
  const secondRowX = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0vw", "0vw"] : ["-2vw", "5vw"],
  );
  const backgroundY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : ["-3.5%", "3.5%"],
  );

  return (
    <section ref={ref} className="ocean-gallery" aria-label="网站核心功能图片画廊">
      <motion.div
        className="section-scroll-background ocean-gallery-scroll-background"
        style={{ y: backgroundY }}
        aria-hidden="true"
      />
      <div className="ocean-gallery-glow" aria-hidden="true" />
      <div className="ocean-gallery-viewport">
        {oceanGalleryRows.map((images, rowIndex) => (
          <motion.div
            className="ocean-gallery-row"
            key={rowIndex}
            style={{ x: rowIndex === 0 ? firstRowX : secondRowX }}
          >
            {images.map(({ src, alt }) => (
              <figure className="ocean-gallery-card" key={src}>
                <img src={src} alt={alt} loading="lazy" />
              </figure>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AboutSection({ copy }: { copy: Copy }) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const backgroundY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : ["-3.5%", "3.5%"],
  );
  const ornaments = [
    ["shell", publicAsset("images/home/project-shell.png"), -70, 0.1],
    ["water-drop", publicAsset("images/home/project-water-drop.png"), 70, 0.18],
    ["glass-cube", publicAsset("images/home/project-glass-cube.png"), -70, 0.24],
    ["arrow", publicAsset("images/home/project-arrow.png"), 70, 0.3],
  ] as const;

  return (
    <section ref={ref} className="about project-about" id="about" aria-labelledby="project-about-title">
      <motion.div
        className="section-scroll-background project-about-scroll-background"
        style={{ y: backgroundY }}
        aria-hidden="true"
      />
      <div className="project-about-rays" aria-hidden="true" />
      {ornaments.map(([name, src, x, delay]) => (
        <FadeIn
          key={name}
          x={x}
          y={0}
          delay={delay}
          duration={0.9}
          className={`project-ornament project-ornament-${name}`}
        >
          <img src={src} alt="" aria-hidden="true" loading="lazy" />
        </FadeIn>
      ))}
      <div className="project-about-content">
        <FadeIn y={40}>
          <h2 id="project-about-title">{copy.aboutTitle}</h2>
        </FadeIn>
        <div className="project-about-copy">
          <p>{copy.aboutLines.map((line) => <span key={line}>{line}</span>)}</p>
        </div>
      </div>
    </section>
  );
}

function ServicesSection({ copy }: { copy: Copy }) {
  return (
    <section className="services" id="services">
      <FadeIn y={40}>
        <h2 className="section-title dark-title">{copy.services}</h2>
      </FadeIn>
      <div className="services-list">
        {copy.serviceItems.map(([name, description], index) => (
          <FadeIn key={`${name}-${index}`} delay={index * 0.1}>
            <article className="service-item">
              <span className="big-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{name}</h3>
                <p>{description}</p>
              </div>
            </article>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ copy, index }: { copy: Copy; index: number }) {
  const [name, category] = copy.projects[index];
  const images = imageSets[index % imageSets.length];

  return (
    <motion.article
      className="project-card"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "50px", amount: 0 }}
      transition={{ delay: (index % 2) * 0.08, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="project-top">
        <span className="big-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="project-category">{category}</span>
        <h3>{name}</h3>
        <Link className="live-button" href={projectLinks[index]}>
          {copy.live}
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="project-grid">
        <div className="project-left">
          <img src={images[0]} alt={`${name} detail`} loading="lazy" />
          <img src={images[1]} alt={`${name} detail`} loading="lazy" />
        </div>
        <img
          className="project-main"
          src={images[2]}
          alt={name}
          loading="lazy"
        />
      </div>
    </motion.article>
  );
}

function ProjectsSection({ copy }: { copy: Copy }) {
  return (
    <section className="projects" id="projects">
      <FadeIn y={40}>
        <h2 className="section-title hero-heading">{copy.project}</h2>
      </FadeIn>
      <div className="project-list">
        {projectLinks.map((_, index) => (
          <ProjectCard key={index} copy={copy} index={index} />
        ))}
      </div>
      <footer>
        <span>贝类育苗水质监测平台 © 2026</span>
        <a href="#home">{copy.back}</a>
      </footer>
    </section>
  );
}

export default function Home() {
  const [language, setLanguage] = usePersistentState<Language>("jack-language", "zh");

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [language]);

  const copy = translations[language];

  return (
    <main className="jack-home">
      <SystemNavigation active="intro" />
      <HeroSection
        copy={copy}
        language={language}
        setLanguage={setLanguage}
      />
      <MarqueeSection />
      <AboutSection copy={copy} />
      <ServicesSection copy={copy} />
      <ProjectsSection copy={copy} />
    </main>
  );
}
