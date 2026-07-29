import { describe, expect, test } from 'bun:test';

import {
  BRAND_FALLBACK,
  isWhiteLabelled,
  parseBrandConfig,
  type BrandConfig,
} from './brand';

/** 默认 fixture：后端未配置任何 brand_* 时返回的形态 */
const defaultFixture = () => ({
  site_name: 'imboy',
  logo_url: '',
  splash_url: '',
  primary_color: '#2474E5',
  accent_color: '',
  theme: 'light',
  slogan: '',
  copyright: '',
  company: '',
  support_url: '',
  privacy_url: '',
  edition: 'community',
});

/** 白标 fixture：私有化客户完整换品牌 */
const whiteLabelFixture = () => ({
  site_name: '某企业IM',
  logo_url: 'https://cdn.example.com/logo.png',
  splash_url: 'https://cdn.example.com/splash.png',
  primary_color: '#1A73E8',
  accent_color: '#FF6D00',
  theme: 'dark',
  slogan: '高效协作',
  copyright: '© 2026 某企业',
  company: '某企业股份有限公司',
  support_url: 'https://support.example.com',
  privacy_url: 'https://example.com/privacy',
  edition: 'enterprise',
});

const URL_FIELDS = [
  ['logo_url', 'logoUrl'],
  ['splash_url', 'splashUrl'],
  ['support_url', 'supportUrl'],
  ['privacy_url', 'privacyUrl'],
] as const;

describe('默认 fixture', () => {
  test('默认配置解析后等于内置 fallback', () => {
    expect(parseBrandConfig(defaultFixture())).toEqual({ ...BRAND_FALLBACK });
  });

  test('客服与隐私链接默认为空，代码不得预置任何联系方式', () => {
    const b = parseBrandConfig(defaultFixture());
    expect(b.supportUrl).toBe('');
    expect(b.privacyUrl).toBe('');
    expect(BRAND_FALLBACK.supportUrl).toBe('');
    expect(BRAND_FALLBACK.privacyUrl).toBe('');
  });

  test('null / 非对象 / 空对象整体回退默认', () => {
    for (const bad of [null, undefined, 'junk', 42, {}]) {
      expect(parseBrandConfig(bad)).toEqual({ ...BRAND_FALLBACK });
    }
  });

  test('默认主色与 App 主色一致，保证未配置即原生外观', () => {
    expect(BRAND_FALLBACK.primaryColor).toBe('#2474E5');
  });
});

describe('白标 fixture', () => {
  test('完整合法配置原样生效', () => {
    const b = parseBrandConfig(whiteLabelFixture());
    expect(b.siteName).toBe('某企业IM');
    expect(b.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(b.splashUrl).toBe('https://cdn.example.com/splash.png');
    expect(b.primaryColor).toBe('#1A73E8');
    expect(b.accentColor).toBe('#FF6D00');
    expect(b.theme).toBe('dark');
    expect(b.supportUrl).toBe('https://support.example.com');
    expect(b.privacyUrl).toBe('https://example.com/privacy');
    expect(b.edition).toBe('enterprise');
    expect(isWhiteLabelled(b)).toBe(true);
  });

  test('默认配置不算白标', () => {
    expect(isWhiteLabelled(parseBrandConfig(defaultFixture()))).toBe(false);
  });
});

describe('非法值逐字段回退', () => {
  test('非法主色回退默认主色', () => {
    for (const bad of [
      '2474E5',
      '#2474E',
      '#GGGGGG',
      '#-12345',
      'blue',
      '',
      123,
      null,
    ]) {
      expect(parseBrandConfig({ primary_color: bad }).primaryColor).toBe(
        BRAND_FALLBACK.primaryColor,
      );
    }
    expect(parseBrandConfig({ primary_color: '#aAbBcC' }).primaryColor).toBe(
      '#aAbBcC',
    );
  });

  test('非 http(s) 的 URL 一律视为未配置', () => {
    const bad = [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'file:///etc/passwd',
      '//evil.example.com',
      '/relative/path.png',
      'https://',
      'http://',
      42,
      null,
    ];
    for (const [apiKey, prop] of URL_FIELDS) {
      for (const v of bad) {
        const b = parseBrandConfig({ [apiKey]: v });
        expect(b[prop as keyof BrandConfig]).toBe('');
      }
      const ok = parseBrandConfig({ [apiKey]: 'https://ok.example.com/a.png' });
      expect(ok[prop as keyof BrandConfig]).toBe('https://ok.example.com/a.png');
    }
  });

  test('非法主题回退 light', () => {
    for (const bad of ['Dark', 'auto', '', 1, null]) {
      expect(parseBrandConfig({ theme: bad }).theme).toBe('light');
    }
    expect(parseBrandConfig({ theme: 'dark' }).theme).toBe('dark');
  });

  test('空应用名回退 imboy', () => {
    for (const bad of ['', 0, null]) {
      expect(parseBrandConfig({ site_name: bad }).siteName).toBe('imboy');
    }
  });

  test('单个坏字段不污染其余合法字段', () => {
    const b = parseBrandConfig({
      site_name: '某企业IM',
      primary_color: 'not-a-color',
      logo_url: 'https://cdn.example.com/logo.png',
    });
    expect(b.siteName).toBe('某企业IM');
    expect(b.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(b.primaryColor).toBe(BRAND_FALLBACK.primaryColor);
  });

  test('未知键不透传到管理台', () => {
    const b = parseBrandConfig({ site_name: 'X', secret_token: 'leak' });
    expect(Object.keys(b).sort()).toEqual(Object.keys(BRAND_FALLBACK).sort());
    expect('secret_token' in b).toBe(false);
  });
});

describe('三端契约对齐', () => {
  test('字段集与后端 brand_handler:defaults/0 一致', () => {
    // 后端 defaults/0 的键（snake_case）→ 前端属性名
    const backendFields = [
      'site_name',
      'logo_url',
      'splash_url',
      'primary_color',
      'accent_color',
      'theme',
      'slogan',
      'copyright',
      'company',
      'support_url',
      'privacy_url',
    ];
    // edition 由 license 注入，不在 defaults/0 里但在响应中
    expect(Object.keys(BRAND_FALLBACK).sort()).toEqual(
      [...backendFields, 'edition']
        .map((k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()))
        .sort(),
    );
  });
});
