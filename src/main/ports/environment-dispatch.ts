// ports/environment-dispatch — #502 슬라이스 1 driven 인터페이스. domain 만 의존.
// 셸 명령 하나를 부르는 것이 전부다. 어떤 명령이 허용되는지는 app/control 이 판정한다.
export interface EnvironmentCommandPort {
  invoke(command: string, args: Readonly<Record<string, unknown>>): Promise<unknown>;
}
