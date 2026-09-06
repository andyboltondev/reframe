import { useRef, useState } from 'react'

interface Props {
  onDrop(dt: DataTransfer): void
  onPick(files: FileList): void
}

export default function Dropzone({ onDrop, onPick }: Props) {
  const [over, setOver] = useState(false)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer) }}
    >
      <h2>Drop images here</h2>
      <p>Images or folders supported</p>
      <div className="dropzone-actions">
        <button onClick={() => filesRef.current?.click()}>Choose Images</button>
        <button onClick={() => folderRef.current?.click()}>Choose Folder</button>
      </div>
      <input
        ref={filesRef} type="file" multiple accept="image/*" hidden
        onChange={(e) => e.target.files && onPick(e.target.files)}
      />
      <input
        ref={folderRef} type="file" hidden
        // @ts-expect-error non-standard but widely supported
        webkitdirectory="" directory=""
        onChange={(e) => e.target.files && onPick(e.target.files)}
      />
    </div>
  )
}
