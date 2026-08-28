import yaml from 'js-yaml';
import type { Profile } from './types';
import profileRaw from '../data/profile.yaml?raw';

export function getProfile(): Profile {
  return yaml.load(profileRaw) as Profile;
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function yamlLine(indent: 0 | 1 | 2, inner: string): string {
  const indentClass = indent === 0 ? '' : ` yaml-indent-${indent}`;
  return `<span class="yaml-line${indentClass}">${inner}</span>`;
}

function yamlKey(key: string): string {
  return `<span class="yaml-key">${esc(key)}</span><span class="yaml-punct">:</span>`;
}

function yamlKeyVal(key: string, value: string, indent: 0 | 1 | 2 = 0): string {
  return yamlLine(
    indent,
    `${yamlKey(key)} <span class="yaml-val">${esc(value)}</span>`,
  );
}

function yamlSection(key: string, indent: 0 | 1 = 0): string {
  return yamlLine(indent, yamlKey(key));
}

function yamlListItem(value: string): string {
  return yamlLine(2, `<span class="yaml-punct">- </span><span class="yaml-val">${esc(value)}</span>`);
}

export function renderEngineerYamlHtml(profile: Profile): string {
  const { engineer: e } = profile;
  return [
    yamlKeyVal('apiVersion', e.apiVersion),
    yamlKeyVal('kind', e.kind),
    yamlSection('metadata'),
    yamlKeyVal('name', e.metadata.name, 1),
    yamlKeyVal('role', e.metadata.role, 1),
    yamlKeyVal('location', e.metadata.location, 1),
    yamlSection('spec'),
    yamlLine(
      1,
      `${yamlKey('status')} <span class="yaml-val">${esc(e.spec.status)}</span> <span class="yaml-status-dot" aria-hidden="true"></span>`,
    ),
    yamlKeyVal('experience', e.spec.experience, 1),
    yamlSection('stack', 1),
    ...e.spec.stack.map(yamlListItem),
    yamlSection('focus', 1),
    ...e.spec.focus.map(yamlListItem),
  ].join('');
}
