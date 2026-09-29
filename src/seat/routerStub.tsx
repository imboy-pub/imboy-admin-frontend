/**
 * SC-BLD：seat 构建专用的 react-router-dom 替身（仅 vite mode 'seat' 经
 * resolve.alias 生效；Admin 构建/dev server 不受影响）。
 *
 * 为什么需要：SeatWorkspacePage 的共享抽屉 EntityDrawer → EntityDrawerSections
 * 顶层静态 `import { Link } from 'react-router-dom'`，会把整个 react-router
 * 库代码拖进坐席产物。但坐席页两处 EntityDrawer 均不传 `sections`（Link 渲染
 * 路径运行时不可达），页面在无 Router 上下文下完全自洽。替身用纯 <a> 满足
 * 模块解析，使坐席 runtime 零 react-router（入口 BAN：Admin SPA 路由面不进
 * 坐席静态 runtime；同源 frame 内 SPA 导航本就无意义）。
 *
 * 安全网：rollup 对 ESM 缺失导出会构建期报错——若未来坐席依赖图引入
 * react-router 的其他导出，`bun run build:widget` 直接失败，不会静默错位。
 * 届时应由该卡把 Link 类导航改为同源 URL（frame 内无 SPA 路由）。
 */
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type StubLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

/** 纯 <a> 替身：seat 产物内不做 SPA 导航；to 直接落 href。 */
export const Link = forwardRef<HTMLAnchorElement, StubLinkProps>(
  function StubLink({ to, children, ...rest }, ref) {
    return (
      <a ref={ref} href={to ?? "#"} {...rest}>
        {children}
      </a>
    );
  },
);

export default Link;
