export type Contact = {
  label: string;
  handle: string;
  url: string;
};

export type CareerJob = {
  title: string;
  company: string;
  period: string;
  status: 'IN PROGRESS' | 'COMPLETED';
  highlights: string[];
  stack: string[];
};

export type ProjectItem = {
  name: string;
  description: string;
  url: string;
  stars: string;
  forks: string;
};

export type Profile = {
  site: {
    handle: string;
  };
  hero: {
    greeting: string;
    name: string;
    role: string;
    tagline: string;
    stack: string[];
    cardName: string;
    cardRole: string;
    cardReady: string;
    cardStatus: string;
  };
  engineer: {
    apiVersion: string;
    kind: string;
    metadata: {
      name: string;
      role: string;
      location: string;
    };
    spec: {
      status: string;
      statusEmoji: string;
      experience: string;
      stack: string[];
      focus: string[];
    };
  };
  about: {
    prompt: string;
    title: string;
    text: string;
  };
  contacts: {
    github: Contact;
    telegram: Contact;
    email: Contact;
  };
  career: {
    workflowFile: string;
    title: string;
    viewHistoryLabel: string;
    jobs: CareerJob[];
  };
  projects: {
    title: string;
    items: ProjectItem[];
  };
};
