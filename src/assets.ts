declare global {
  interface Window { cardroomAssets?: Record<string,string> }
}
export function assetPath(name:string){
  const embedded=window.cardroomAssets?.[name]
  if(embedded)return embedded
  const revision=import.meta.env.VITE_ASSET_REVISIONS?.[name]
  // CSS custom properties can be consumed by a sheet in assets/, one level below the page.
  const url=new URL(import.meta.env.BASE_URL+name,document.baseURI)
  if(revision)url.searchParams.set('v',revision)
  return url.href
}
