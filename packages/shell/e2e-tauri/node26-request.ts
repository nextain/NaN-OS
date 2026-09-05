/**
 * Node 26 에서 WebDriver 세션 요청이 거절되는 것을 막는다.
 *
 * Node 26 의 fetch 는 본문을 감싸 보내는데, webdriverio 9 는 그 감싸기 전에
 * Content-Length 를 미리 계산해 넣는다. 두 값이 어긋나면 undici 가 멀쩡한
 * 세션 요청을 `UND_ERR_INVALID_ARG` 로 거절한다. 헤더를 지우고 fetch 가
 * 본문에서 직접 세게 둔다.
 *
 * 왜 파일을 따로 두는가: 이 대응이 기본 설정 안에만 적혀 있었다. 전용 설정
 * 열 개는 그것을 상속하지 않으므로 전부 세션 생성 단계에서 죽었고, 계약
 * 테스트는 기본 설정만 읽고 있어서 그 사실을 말해 주지 않았다. 한 곳에 두고
 * 모두가 같은 것을 쓰게 한다.
 */
export const transformRequest = (request: Request): Request => {
	request.headers.delete("Content-Length");
	return request;
};
