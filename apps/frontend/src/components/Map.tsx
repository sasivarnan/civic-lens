import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Issue } from "@civiclens/shared"
type Props = {
  issues?: Issue[]
  point?: { latitude: number; longitude: number } | null
  onIssueSelect?: (id: string) => void
  onSelect?: (latitude: number, longitude: number) => void
  onBounds?: (bounds: {
    south: number
    north: number
    west: number
    east: number
  }) => void
}
export default function Map({
  issues = [],
  point,
  onSelect,
  onBounds,
  onIssueSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    markers = useRef<L.LayerGroup | null>(null)
  const callbacks = useRef({ onSelect, onBounds, onIssueSelect })
  const selectable = Boolean(onIssueSelect)
  useEffect(() => {
    callbacks.current = { onSelect, onBounds, onIssueSelect }
  }, [onSelect, onBounds, onIssueSelect])
  useEffect(() => {
    if (!ref.current) return
    const m = L.map(ref.current).setView([12.9716, 77.5946], 12)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(m)
    markers.current = L.layerGroup().addTo(m)
    map.current = m
    m.on("click", (e: L.LeafletMouseEvent) =>
      callbacks.current.onSelect?.(e.latlng.lat, e.latlng.lng)
    )
    m.on("moveend", () => {
      const b = m.getBounds()
      callbacks.current.onBounds?.({
        south: b.getSouth(),
        north: b.getNorth(),
        west: b.getWest(),
        east: b.getEast(),
      })
    })
    return () => {
      m.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    const layer = markers.current
    if (!layer) return
    layer.clearLayers()
    const icon = L.divIcon({
      className: "civic-marker",
      html: "<span></span>",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
    for (const issue of issues) {
      const link = document.createElement("a")
      link.href = "/issues/" + issue.id
      link.textContent = issue.title
      const marker = L.marker([issue.latitude, issue.longitude], {
        icon,
        alt: issue.title,
        title: issue.title,
      }).addTo(layer)
      if (selectable)
        marker.on("click", () => callbacks.current.onIssueSelect?.(issue.id))
      else marker.bindPopup(link)
    }
    if (point) {
      L.marker([point.latitude, point.longitude], {
        icon,
        alt: "Selected incident point",
        title: "Selected incident point",
      }).addTo(layer)
      map.current?.panTo([point.latitude, point.longitude])
    }
  }, [issues, point, selectable])
  return (
    <div
      ref={ref}
      className="civic-map"
      aria-label={
        onSelect
          ? "Select incident point. Coordinate fields are also available."
          : "Map of public issues"
      }
    />
  )
}
