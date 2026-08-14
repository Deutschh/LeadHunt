--
-- PostgreSQL database dump
--

\restrict AFJhzyh19tIJI4wTaZvwWGdUJs9jJY1lVr8MYJUZb5VnOevrVLxydstycHeF0gi

-- Dumped from database version 17.10 (29ad1b7)
-- Dumped by pg_dump version 17.10

-- Started on 2026-08-11 04:07:21

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 243 (class 1255 OID 262206)
-- Name: leadhunt_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leadhunt_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 236 (class 1259 OID 122881)
-- Name: ai_prompt_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompt_configs (
    id bigint NOT NULL,
    prompt_angle text NOT NULL,
    prompt_label text NOT NULL,
    prompt_version text,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- TOC entry 235 (class 1259 OID 122880)
-- Name: ai_prompt_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_prompt_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3583 (class 0 OID 0)
-- Dependencies: 235
-- Name: ai_prompt_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_prompt_configs_id_seq OWNED BY public.ai_prompt_configs.id;


--
-- TOC entry 217 (class 1259 OID 16508)
-- Name: automation_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_settings (
    id integer NOT NULL,
    is_active boolean DEFAULT false,
    min_interval_minutes integer DEFAULT 10,
    max_interval_minutes integer DEFAULT 20,
    daily_limit integer DEFAULT 30,
    start_hour time without time zone DEFAULT '09:00:00'::time without time zone,
    end_hour time without time zone DEFAULT '18:00:00'::time without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_ai_enabled boolean DEFAULT false,
    followup_enabled boolean DEFAULT true,
    followup_max_count integer DEFAULT 2,
    followup_delay_hours_1 integer DEFAULT 24,
    followup_delay_hours_2 integer DEFAULT 72,
    followups_per_cycle integer DEFAULT 2,
    followup_gap_seconds integer DEFAULT 30
);


--
-- TOC entry 218 (class 1259 OID 16523)
-- Name: automation_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3584 (class 0 OID 0)
-- Dependencies: 218
-- Name: automation_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_settings_id_seq OWNED BY public.automation_settings.id;


--
-- TOC entry 238 (class 1259 OID 172033)
-- Name: client_briefings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_briefings (
    id integer NOT NULL,
    lead_id integer,
    business_name text,
    instagram text,
    whatsapp text,
    city text,
    main_services text,
    most_profitable_service text,
    differential text,
    target_audience text,
    goals jsonb DEFAULT '[]'::jsonb,
    brand_colors text,
    references_text text,
    notes text,
    status text DEFAULT 'submitted'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    weekly_clients text,
    biggest_problem text,
    investment_range text
);


--
-- TOC entry 237 (class 1259 OID 172032)
-- Name: client_briefings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_briefings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3585 (class 0 OID 0)
-- Dependencies: 237
-- Name: client_briefings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_briefings_id_seq OWNED BY public.client_briefings.id;


--
-- TOC entry 219 (class 1259 OID 16524)
-- Name: home_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_notes (
    id integer NOT NULL,
    title text NOT NULL,
    content text,
    expires_at date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 220 (class 1259 OID 16530)
-- Name: home_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.home_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3586 (class 0 OID 0)
-- Dependencies: 220
-- Name: home_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.home_notes_id_seq OWNED BY public.home_notes.id;


--
-- TOC entry 221 (class 1259 OID 16531)
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_activities (
    id integer NOT NULL,
    lead_id integer,
    description text NOT NULL,
    type text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 222 (class 1259 OID 16537)
-- Name: lead_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lead_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3587 (class 0 OID 0)
-- Dependencies: 222
-- Name: lead_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lead_activities_id_seq OWNED BY public.lead_activities.id;


--
-- TOC entry 223 (class 1259 OID 16538)
-- Name: lead_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_events (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    event_type text NOT NULL,
    event_value text,
    source text DEFAULT 'system'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- TOC entry 224 (class 1259 OID 16546)
-- Name: lead_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lead_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3588 (class 0 OID 0)
-- Dependencies: 224
-- Name: lead_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lead_events_id_seq OWNED BY public.lead_events.id;


--
-- TOC entry 242 (class 1259 OID 262166)
-- Name: lead_service_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_service_opportunities (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    service_id integer NOT NULL,
    lead_category text,
    niche_key text,
    analysis_notes text,
    perceived_goal text,
    pain_points jsonb DEFAULT '[]'::jsonb NOT NULL,
    negotiation_guide jsonb,
    guide_generated_at timestamp without time zone,
    selected_score smallint DEFAULT 1 NOT NULL,
    interest_score smallint DEFAULT 0 NOT NULL,
    preview_score smallint DEFAULT 0 NOT NULL,
    price_score smallint DEFAULT 0 NOT NULL,
    closed_score smallint DEFAULT 0 NOT NULL,
    total_score smallint GENERATED ALWAYS AS (((((selected_score + interest_score) + preview_score) + price_score) + closed_score)) STORED,
    is_active boolean DEFAULT true NOT NULL,
    selected_at timestamp without time zone DEFAULT now() NOT NULL,
    interest_marked_at timestamp without time zone,
    preview_marked_at timestamp without time zone,
    price_marked_at timestamp without time zone,
    closed_marked_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    analysis_updated_at timestamp without time zone,
    CONSTRAINT lead_service_opportunities_closed_score_check CHECK ((closed_score = ANY (ARRAY[0, 4]))),
    CONSTRAINT lead_service_opportunities_interest_score_check CHECK ((interest_score = ANY (ARRAY[0, 1]))),
    CONSTRAINT lead_service_opportunities_pain_points_check CHECK ((jsonb_typeof(pain_points) = 'array'::text)),
    CONSTRAINT lead_service_opportunities_preview_score_check CHECK ((preview_score = ANY (ARRAY[0, 1]))),
    CONSTRAINT lead_service_opportunities_price_score_check CHECK ((price_score = ANY (ARRAY[0, 1]))),
    CONSTRAINT lead_service_opportunities_selected_score_check CHECK ((selected_score = ANY (ARRAY[0, 1])))
);


--
-- TOC entry 241 (class 1259 OID 262165)
-- Name: lead_service_opportunities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lead_service_opportunities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3589 (class 0 OID 0)
-- Dependencies: 241
-- Name: lead_service_opportunities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lead_service_opportunities_id_seq OWNED BY public.lead_service_opportunities.id;


--
-- TOC entry 225 (class 1259 OID 16547)
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id integer NOT NULL,
    name text NOT NULL,
    phone text,
    category text,
    has_website boolean DEFAULT false,
    status text DEFAULT 'pending'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    niche text,
    rating numeric(3,2),
    reviews_count integer DEFAULT 0,
    neighborhood text,
    city text,
    interest_level integer DEFAULT 0,
    market_observation text,
    internal_notes text,
    last_contact timestamp without time zone,
    services_offered jsonb DEFAULT '[]'::jsonb,
    competitor_url text,
    deal_details jsonb DEFAULT '{}'::jsonb,
    snooze_until timestamp without time zone,
    acquisition_cost numeric(10,2) DEFAULT 0,
    is_archived boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    auto_contact_status text DEFAULT 'idle'::text,
    custom_message text,
    is_invalid_number boolean DEFAULT false,
    ai_message_suggestion text,
    is_ai_ready boolean DEFAULT false,
    lead_category text,
    lead_city text,
    responded_at timestamp without time zone,
    preview_sent boolean DEFAULT false,
    preview_sent_at timestamp without time zone,
    price_requested boolean DEFAULT false,
    sale_value numeric(10,2) DEFAULT 0.00,
    assigned_number character varying(50),
    followup_count integer DEFAULT 0,
    lead_score integer DEFAULT 0,
    temperature_band text DEFAULT 'cold'::text,
    pipeline_stage text DEFAULT 'pending'::text,
    closed_at timestamp without time zone,
    lost_reason text,
    last_reply_at timestamp without time zone,
    last_followup_at timestamp without time zone,
    next_followup_at timestamp without time zone,
    ai_prompt_angle text,
    ai_prompt_label text,
    ai_prompt_version text,
    ai_message_generated_at timestamp without time zone,
    ai_generation_batch_id text,
    offer_type text,
    offer_label text,
    offer_reason text,
    message_type text,
    preview_opened boolean DEFAULT false
);


--
-- TOC entry 226 (class 1259 OID 16572)
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3590 (class 0 OID 0)
-- Dependencies: 226
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- TOC entry 227 (class 1259 OID 16573)
-- Name: niche_strategies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.niche_strategies (
    id integer NOT NULL,
    niche_name text NOT NULL,
    hook text NOT NULL,
    call_to_action text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- TOC entry 228 (class 1259 OID 16579)
-- Name: niche_strategies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.niche_strategies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3591 (class 0 OID 0)
-- Dependencies: 228
-- Name: niche_strategies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.niche_strategies_id_seq OWNED BY public.niche_strategies.id;


--
-- TOC entry 234 (class 1259 OID 98305)
-- Name: preview_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preview_projects (
    id integer NOT NULL,
    lead_id integer,
    template_key text NOT NULL,
    project_name text NOT NULL,
    slug text NOT NULL,
    niche text,
    city text,
    primary_color text DEFAULT '#000000'::text,
    secondary_color text DEFAULT '#ffffff'::text,
    headline text,
    subheadline text,
    whatsapp text,
    instagram text,
    logo_url text,
    preview_image_url text,
    status text DEFAULT 'draft'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- TOC entry 233 (class 1259 OID 98304)
-- Name: preview_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.preview_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3592 (class 0 OID 0)
-- Dependencies: 233
-- Name: preview_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.preview_projects_id_seq OWNED BY public.preview_projects.id;


--
-- TOC entry 229 (class 1259 OID 16580)
-- Name: scraper_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraper_config (
    id integer NOT NULL,
    selector_type text,
    tags text
);


--
-- TOC entry 230 (class 1259 OID 16585)
-- Name: scraper_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scraper_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3593 (class 0 OID 0)
-- Dependencies: 230
-- Name: scraper_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scraper_config_id_seq OWNED BY public.scraper_config.id;


--
-- TOC entry 231 (class 1259 OID 16586)
-- Name: sending_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_numbers (
    id integer NOT NULL,
    label text NOT NULL,
    phone_number text NOT NULL,
    whatsapp_profile_name text,
    status text DEFAULT 'active'::text,
    daily_limit integer DEFAULT 40,
    sent_today integer DEFAULT 0,
    warmup_stage text DEFAULT 'warming'::text,
    last_reset_at timestamp without time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    chrome_port integer,
    chrome_profile_path text,
    health_status text DEFAULT 'unknown'::text,
    last_health_check_at timestamp without time zone,
    last_error text,
    consecutive_failures integer DEFAULT 0,
    paused_until timestamp without time zone
);


--
-- TOC entry 232 (class 1259 OID 16600)
-- Name: sending_numbers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sending_numbers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3594 (class 0 OID 0)
-- Dependencies: 232
-- Name: sending_numbers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sending_numbers_id_seq OWNED BY public.sending_numbers.id;


--
-- TOC entry 240 (class 1259 OID 262145)
-- Name: velaris_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.velaris_services (
    id integer NOT NULL,
    service_key text NOT NULL,
    service_name text NOT NULL,
    service_type text NOT NULL,
    problem_category text NOT NULL,
    description text NOT NULL,
    how_it_works text NOT NULL,
    problems_solved jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_niches jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT velaris_services_display_order_check CHECK ((display_order >= 0)),
    CONSTRAINT velaris_services_problems_solved_check CHECK ((jsonb_typeof(problems_solved) = 'array'::text)),
    CONSTRAINT velaris_services_service_type_check CHECK ((service_type = ANY (ARRAY['universal'::text, 'nichado'::text]))),
    CONSTRAINT velaris_services_target_niches_check CHECK ((jsonb_typeof(target_niches) = 'array'::text))
);


--
-- TOC entry 239 (class 1259 OID 262144)
-- Name: velaris_services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.velaris_services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3595 (class 0 OID 0)
-- Dependencies: 239
-- Name: velaris_services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.velaris_services_id_seq OWNED BY public.velaris_services.id;


--
-- TOC entry 3335 (class 2604 OID 122884)
-- Name: ai_prompt_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_configs ALTER COLUMN id SET DEFAULT nextval('public.ai_prompt_configs_id_seq'::regclass);


--
-- TOC entry 3271 (class 2604 OID 16601)
-- Name: automation_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_settings ALTER COLUMN id SET DEFAULT nextval('public.automation_settings_id_seq'::regclass);


--
-- TOC entry 3339 (class 2604 OID 172036)
-- Name: client_briefings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_briefings ALTER COLUMN id SET DEFAULT nextval('public.client_briefings_id_seq'::regclass);


--
-- TOC entry 3286 (class 2604 OID 16602)
-- Name: home_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_notes ALTER COLUMN id SET DEFAULT nextval('public.home_notes_id_seq'::regclass);


--
-- TOC entry 3288 (class 2604 OID 16603)
-- Name: lead_activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities ALTER COLUMN id SET DEFAULT nextval('public.lead_activities_id_seq'::regclass);


--
-- TOC entry 3290 (class 2604 OID 16604)
-- Name: lead_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events ALTER COLUMN id SET DEFAULT nextval('public.lead_events_id_seq'::regclass);


--
-- TOC entry 3351 (class 2604 OID 262169)
-- Name: lead_service_opportunities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_service_opportunities ALTER COLUMN id SET DEFAULT nextval('public.lead_service_opportunities_id_seq'::regclass);


--
-- TOC entry 3294 (class 2604 OID 16605)
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- TOC entry 3316 (class 2604 OID 16606)
-- Name: niche_strategies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niche_strategies ALTER COLUMN id SET DEFAULT nextval('public.niche_strategies_id_seq'::regclass);


--
-- TOC entry 3329 (class 2604 OID 98308)
-- Name: preview_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preview_projects ALTER COLUMN id SET DEFAULT nextval('public.preview_projects_id_seq'::regclass);


--
-- TOC entry 3318 (class 2604 OID 16607)
-- Name: scraper_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_config ALTER COLUMN id SET DEFAULT nextval('public.scraper_config_id_seq'::regclass);


--
-- TOC entry 3319 (class 2604 OID 16608)
-- Name: sending_numbers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_numbers ALTER COLUMN id SET DEFAULT nextval('public.sending_numbers_id_seq'::regclass);


--
-- TOC entry 3344 (class 2604 OID 262148)
-- Name: velaris_services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.velaris_services ALTER COLUMN id SET DEFAULT nextval('public.velaris_services_id_seq'::regclass);


--
-- TOC entry 3410 (class 2606 OID 122891)
-- Name: ai_prompt_configs ai_prompt_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_configs
    ADD CONSTRAINT ai_prompt_configs_pkey PRIMARY KEY (id);


--
-- TOC entry 3412 (class 2606 OID 122893)
-- Name: ai_prompt_configs ai_prompt_configs_prompt_angle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_configs
    ADD CONSTRAINT ai_prompt_configs_prompt_angle_key UNIQUE (prompt_angle);


--
-- TOC entry 3374 (class 2606 OID 16661)
-- Name: automation_settings automation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_settings
    ADD CONSTRAINT automation_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3414 (class 2606 OID 172044)
-- Name: client_briefings client_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_briefings
    ADD CONSTRAINT client_briefings_pkey PRIMARY KEY (id);


--
-- TOC entry 3376 (class 2606 OID 16668)
-- Name: home_notes home_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_notes
    ADD CONSTRAINT home_notes_pkey PRIMARY KEY (id);


--
-- TOC entry 3378 (class 2606 OID 16621)
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- TOC entry 3383 (class 2606 OID 16641)
-- Name: lead_events lead_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);


--
-- TOC entry 3424 (class 2606 OID 262190)
-- Name: lead_service_opportunities lead_service_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_service_opportunities
    ADD CONSTRAINT lead_service_opportunities_pkey PRIMARY KEY (id);


--
-- TOC entry 3388 (class 2606 OID 16629)
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- TOC entry 3392 (class 2606 OID 16651)
-- Name: niche_strategies niche_strategies_niche_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niche_strategies
    ADD CONSTRAINT niche_strategies_niche_name_key UNIQUE (niche_name);


--
-- TOC entry 3394 (class 2606 OID 16653)
-- Name: niche_strategies niche_strategies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niche_strategies
    ADD CONSTRAINT niche_strategies_pkey PRIMARY KEY (id);


--
-- TOC entry 3406 (class 2606 OID 98317)
-- Name: preview_projects preview_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preview_projects
    ADD CONSTRAINT preview_projects_pkey PRIMARY KEY (id);


--
-- TOC entry 3408 (class 2606 OID 98319)
-- Name: preview_projects preview_projects_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preview_projects
    ADD CONSTRAINT preview_projects_slug_key UNIQUE (slug);


--
-- TOC entry 3396 (class 2606 OID 16670)
-- Name: scraper_config scraper_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_config
    ADD CONSTRAINT scraper_config_pkey PRIMARY KEY (id);


--
-- TOC entry 3398 (class 2606 OID 16672)
-- Name: scraper_config scraper_config_selector_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_config
    ADD CONSTRAINT scraper_config_selector_type_key UNIQUE (selector_type);


--
-- TOC entry 3402 (class 2606 OID 16656)
-- Name: sending_numbers sending_numbers_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_numbers
    ADD CONSTRAINT sending_numbers_phone_number_key UNIQUE (phone_number);


--
-- TOC entry 3404 (class 2606 OID 16658)
-- Name: sending_numbers sending_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_numbers
    ADD CONSTRAINT sending_numbers_pkey PRIMARY KEY (id);


--
-- TOC entry 3390 (class 2606 OID 16631)
-- Name: leads unique_phone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT unique_phone UNIQUE (phone);


--
-- TOC entry 3417 (class 2606 OID 262162)
-- Name: velaris_services velaris_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.velaris_services
    ADD CONSTRAINT velaris_services_pkey PRIMARY KEY (id);


--
-- TOC entry 3419 (class 2606 OID 262164)
-- Name: velaris_services velaris_services_service_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.velaris_services
    ADD CONSTRAINT velaris_services_service_key_key UNIQUE (service_key);


--
-- TOC entry 3379 (class 1259 OID 16634)
-- Name: idx_lead_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_events_created_at ON public.lead_events USING btree (created_at);


--
-- TOC entry 3380 (class 1259 OID 16638)
-- Name: idx_lead_events_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_events_lead_id ON public.lead_events USING btree (lead_id);


--
-- TOC entry 3381 (class 1259 OID 16639)
-- Name: idx_lead_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_events_type ON public.lead_events USING btree (event_type);


--
-- TOC entry 3384 (class 1259 OID 16622)
-- Name: idx_leads_assigned_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned_number ON public.leads USING btree (assigned_number);


--
-- TOC entry 3385 (class 1259 OID 16623)
-- Name: idx_leads_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_pipeline_stage ON public.leads USING btree (pipeline_stage);


--
-- TOC entry 3386 (class 1259 OID 16624)
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- TOC entry 3399 (class 1259 OID 16648)
-- Name: idx_sending_numbers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sending_numbers_active ON public.sending_numbers USING btree (is_active);


--
-- TOC entry 3400 (class 1259 OID 16649)
-- Name: idx_sending_numbers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sending_numbers_status ON public.sending_numbers USING btree (status);


--
-- TOC entry 3420 (class 1259 OID 262202)
-- Name: ix_lead_service_opportunities_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lead_service_opportunities_lead ON public.lead_service_opportunities USING btree (lead_id);


--
-- TOC entry 3421 (class 1259 OID 262204)
-- Name: ix_lead_service_opportunities_niche_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lead_service_opportunities_niche_service ON public.lead_service_opportunities USING btree (niche_key, service_id);


--
-- TOC entry 3422 (class 1259 OID 262203)
-- Name: ix_lead_service_opportunities_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lead_service_opportunities_service ON public.lead_service_opportunities USING btree (service_id);


--
-- TOC entry 3415 (class 1259 OID 262205)
-- Name: ix_velaris_services_active_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_velaris_services_active_order ON public.velaris_services USING btree (is_active, display_order);


--
-- TOC entry 3425 (class 1259 OID 262201)
-- Name: ux_lead_service_opportunities_active_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_lead_service_opportunities_active_lead ON public.lead_service_opportunities USING btree (lead_id) WHERE (is_active = true);


--
-- TOC entry 3432 (class 2620 OID 262208)
-- Name: lead_service_opportunities trg_lead_service_opportunities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lead_service_opportunities_updated_at BEFORE UPDATE ON public.lead_service_opportunities FOR EACH ROW EXECUTE FUNCTION public.leadhunt_touch_updated_at();


--
-- TOC entry 3431 (class 2620 OID 262207)
-- Name: velaris_services trg_velaris_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_velaris_services_updated_at BEFORE UPDATE ON public.velaris_services FOR EACH ROW EXECUTE FUNCTION public.leadhunt_touch_updated_at();


--
-- TOC entry 3428 (class 2606 OID 172045)
-- Name: client_briefings client_briefings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_briefings
    ADD CONSTRAINT client_briefings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- TOC entry 3426 (class 2606 OID 16632)
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- TOC entry 3429 (class 2606 OID 262191)
-- Name: lead_service_opportunities lead_service_opportunities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_service_opportunities
    ADD CONSTRAINT lead_service_opportunities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- TOC entry 3430 (class 2606 OID 262196)
-- Name: lead_service_opportunities lead_service_opportunities_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_service_opportunities
    ADD CONSTRAINT lead_service_opportunities_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.velaris_services(id) ON DELETE RESTRICT;


--
-- TOC entry 3427 (class 2606 OID 98320)
-- Name: preview_projects preview_projects_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preview_projects
    ADD CONSTRAINT preview_projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


-- Completed on 2026-08-11 04:07:24

--
-- PostgreSQL database dump complete
--

\unrestrict AFJhzyh19tIJI4wTaZvwWGdUJs9jJY1lVr8MYJUZb5VnOevrVLxydstycHeF0gi

