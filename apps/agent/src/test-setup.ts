// jsdom tak implementasi scrollIntoView -- PairingScreen auto-scroll form pairing pas muncul
// (lihat useEffect di PairingScreen.tsx), dan itu ke-render lewat App.tsx di beberapa test
// file lain juga (App.test.tsx). Tanpa mock ini, tiap test yang membuka form pairing gagal
// dengan "scrollIntoView is not a function".
Element.prototype.scrollIntoView = () => {}
